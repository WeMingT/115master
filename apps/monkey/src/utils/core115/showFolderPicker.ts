import { unsafeWindow } from '$'
import * as core115 from './core115'

/**
 * 保存页面原始 jQuery 引用（在 core115.load() 重新加载 jQuery 之前）
 *
 * 关键：core115.load() 会通过 <script> 注入 jQuery，覆盖 window.$。
 * 但 115 页面的 Core SDK（包括 TreeDG）在页面初始化时就已通过闭包
 * 捕获了旧 jQuery 引用。TreeDG 内部的 $.ajax 调用走的是这个旧实例。
 * 如果在 core115.load() 之后才取 unsafeWindow.$，拿到的是新 jQuery，
 * 在新实例上做拦截对 TreeDG 无效。
 */
const pageJQuery: any = (unsafeWindow as any).$ || (unsafeWindow as any).jQuery

/**
 * 使用 115 原生目录选择器（TreeDG）选择目标目录
 *
 * 原理：
 * 1. 加载 Core SDK 并显示 TreeDG 目录选择对话框（以 'copy' 模式）
 * 2. 拦截页面原始 jQuery $.ajax，捕获 copy/move 请求中的目标目录 ID (pid)
 * 3. 返回 fake 成功响应，阻止实际的文件复制/移动
 * 4. 通过 Promise resolve 返回选中的目录 cid
 *
 * @param currentCid - 当前目录 cid（用于设置 FileConfig 上下文）
 * @returns 选中的目录 cid，取消则返回 null
 */
export function showNativeFolderPicker(currentCid = '0'): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false

    const doResolve = (val: string | null) => {
      if (resolved)
        return
      resolved = true
      resolve(val)
    }

    core115.load().then(() => {
      const Core = core115.getCore()
      if (!Core?.TreeDG) {
        console.error('[115Master] Core SDK TreeDG not available')
        doResolve(null)
        return
      }

      /**
       * 使用页面原始 jQuery（TreeDG 闭包引用的那个实例），
       * 回退到当前 window jQuery（core115.load() 未覆盖或页面初始无 jQuery 的情况）
       */
      const $ = pageJQuery || (unsafeWindow as any).$ || (unsafeWindow as any).jQuery
      if (!$ || !$.ajax) {
        console.error('[115Master] jQuery not available on page')
        doResolve(null)
        return
      }

      const originalAjax = $.ajax

      /** 从 data 中提取 pid（支持对象和 URL 编码字符串两种格式） */
      function extractPid(data: any): string {
        if (!data)
          return ''
        if (typeof data === 'object')
          return String(data.pid ?? data.cid ?? '')
        if (typeof data === 'string') {
          const params = new URLSearchParams(data)
          return params.get('pid') || params.get('cid') || ''
        }
        return ''
      }

      /**
       * 拦截 jQuery $.ajax，捕获 copy/move 请求中的目标目录
       * jQuery 支持两种调用签名：$.ajax(settings) 和 $.ajax(url, settings)
       */
      $.ajax = function (...args: any[]) {
        let settings: any
        if (typeof args[0] === 'string') {
          settings = args[1] || {}
          settings.url = args[0]
        }
        else {
          settings = args[0] || {}
        }

        const url: string = settings.url || ''
        if (url.includes('/files/copy') || url.includes('/files/move')) {
          const pid = extractPid(settings.data)

          /** 恢复原始 $.ajax */
          $.ajax = originalAjax

          /** 返回 fake 成功给 TreeDG，阻止实际操作 */
          if (settings.success) {
            settings.success({ state: true, error: '', errno: '', errtype: '' })
          }

          doResolve(pid || null)

          /** 返回可链式调用的 jqXHR-like 对象，避免后续 .done()/.fail() 报错 */
          const fakeXHR: Record<string, any> = {}
          fakeXHR.done = () => fakeXHR
          fakeXHR.fail = () => fakeXHR
          fakeXHR.always = () => fakeXHR
          fakeXHR.then = () => fakeXHR
          return fakeXHR
        }

        /** 非 copy/move 请求正常放行 */
        return originalAjax.apply(this, args)
      }

      /** 设置 FileConfig 上下文 */
      if (Core.FileConfig) {
        Core.FileConfig.cid = currentCid
      }

      /** 创建 dummy 文件对象（pick_code 不存在，实际操作不会生效） */
      const dummyFile = core115.createMockjQueryObject({
        file_type: '1',
        file_id: '__folder_picker_dummy__',
        cate_id: currentCid,
        area_id: '0',
      })

      Core.TreeDG.Show({
        list: [dummyFile],
        type: 'copy',
        has_dir: false,
        callback: () => {
          /** callback 在操作后触发，此时已经通过拦截器 resolve 了 */
        },
      })

      /**
       * 安全超时：如果 3 分钟内没有操作（用户可能关闭了弹窗），
       * 恢复 $.ajax 并 resolve null
       */
      setTimeout(() => {
        if (!resolved) {
          $.ajax = originalAjax
          doResolve(null)
        }
      }, 180_000)
    }).catch(() => {
      doResolve(null)
    })
  })
}
