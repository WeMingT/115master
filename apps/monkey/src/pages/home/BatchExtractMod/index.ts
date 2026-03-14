import type { App } from 'vue'
import type { ArchiveFileInfo } from './types'
import { unsafeWindow } from '$'
import { createApp } from 'vue'
import { BaseMod } from '@/pages/home/BaseMod'
import mainStyles from '@/styles/main.css?inline'
import BatchExtractDialog from './components/BatchExtractDialog.vue'
import ExtractTaskFab from './components/ExtractTaskFab.vue'
import ExtractTaskManager from './components/ExtractTaskManager.vue'
import { extractTaskStore } from './store/extractTaskStore'
import { getSelectedArchives } from './utils/getSelectedArchives'
import './index.css'
import 'iconify-icon'

const BTN_CLASS = 'master-batch-extract-btn'

export class BatchExtractMod extends BaseMod {
  private vueApp: App | null = null
  private dialogContainer: HTMLDivElement | null = null
  private opObserver: MutationObserver | null = null
  private fabApp: App | null = null
  private fabContainer: HTMLDivElement | null = null
  private managerApp: App | null = null
  private managerContainer: HTMLDivElement | null = null

  constructor() {
    super()
    this.init()
  }

  /** 操作栏节点（选中文件时显示） */
  private get opMenuNode() {
    return document.querySelector<HTMLElement>(unsafeWindow.Main.CONFIG.OPMenuBox)
  }

  /** 获取当前目录 cid */
  private get currentCid(): string {
    return String(unsafeWindow.FileMainReInstanceSetting?.cid ?? '0')
  }

  destroy() {
    this.opObserver?.disconnect()
    this.closeDialog()
    this.unmountFab()
    this.unmountManager()
  }

  private async init() {
    await extractTaskStore.init()
    this.observeOperateBox()
    this.mountFab()
    this.mountManager()
  }

  /** 创建按钮元素 */
  private createButton(): HTMLAnchorElement {
    const button = document.createElement('a')
    button.classList.add('button', BTN_CLASS)
    button.href = 'javascript:void(0)'
    button.title = '批量云解压'
    button.innerHTML = `
      <iconify-icon icon="material-symbols:folder-zip-outline" noobserver></iconify-icon>
      <span>批量云解压</span>
    `
    button.onclick = () => this.handleClick()
    return button
  }

  /** 监听操作栏出现，注入按钮 */
  private observeOperateBox() {
    const opBox = this.opMenuNode
    if (!opBox)
      return

    const inject = () => {
      if (opBox.offsetParent !== null && !opBox.querySelector(`.${BTN_CLASS}`)) {
        opBox.append(this.createButton())
      }
    }

    inject()

    this.opObserver = new MutationObserver(inject)
    this.opObserver.observe(opBox, { childList: true, attributes: true })

    if (opBox.parentElement) {
      this.opObserver.observe(opBox.parentElement, { childList: true, attributes: true })
    }
  }

  private handleClick() {
    // 如果对话框已存在但被隐藏，重新显示
    if (this.dialogContainer) {
      this.dialogContainer.style.display = ''
      return
    }

    const archives = getSelectedArchives()
    if (archives.length === 0) {
      alert('请先选择压缩文件（支持 7z、zip、rar、tar 等格式）')
      return
    }

    /** 去重前置检查：如果所有文件都已在任务队列中，提示并打开管理面板 */
    const allActive = archives.every(f => extractTaskStore.isActive(f.pickCode))
    if (allActive) {
      alert('所选文件均已在任务队列中')
      extractTaskStore.openManager()
      return
    }

    this.openDialog(archives)
  }

  private openDialog(files: ArchiveFileInfo[]) {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.inset = '0'
    container.style.zIndex = '99999'
    document.body.appendChild(container)
    this.dialogContainer = container

    const shadowRoot = container.attachShadow({ mode: 'open' })

    const styleElement = document.createElement('style')
    styleElement.textContent = mainStyles
    shadowRoot.appendChild(styleElement)

    const mountPoint = document.createElement('div')
    mountPoint.setAttribute('data-theme', 'light')
    shadowRoot.appendChild(mountPoint)

    const app = createApp(BatchExtractDialog, {
      files,
      currentCid: this.currentCid,
      onClose: () => this.closeDialog(),
      onMinimize: () => this.minimizeDialog(),
    })
    app.mount(mountPoint)
    this.vueApp = app
  }

  /** 隐藏对话框但保持 Vue 运行（任务继续后台执行） */
  private minimizeDialog() {
    if (this.dialogContainer) {
      this.dialogContainer.style.display = 'none'
    }
  }

  /** 完全关闭并清理 */
  private closeDialog() {
    this.vueApp?.unmount()
    this.vueApp = null
    this.dialogContainer?.remove()
    this.dialogContainer = null
  }

  /** 挂载 FAB 浮动按钮 */
  private mountFab() {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.bottom = '0'
    container.style.right = '0'
    container.style.zIndex = '99998'
    container.style.pointerEvents = 'none'
    document.body.appendChild(container)
    this.fabContainer = container

    const shadowRoot = container.attachShadow({ mode: 'open' })

    const styleElement = document.createElement('style')
    styleElement.textContent = mainStyles
    shadowRoot.appendChild(styleElement)

    const mountPoint = document.createElement('div')
    mountPoint.setAttribute('data-theme', 'light')
    mountPoint.style.pointerEvents = 'auto'
    shadowRoot.appendChild(mountPoint)

    this.fabApp = createApp(ExtractTaskFab)
    this.fabApp.mount(mountPoint)
  }

  private unmountFab() {
    this.fabApp?.unmount()
    this.fabApp = null
    this.fabContainer?.remove()
    this.fabContainer = null
  }

  /** 挂载任务管理面板 */
  private mountManager() {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.inset = '0'
    container.style.zIndex = '99999'
    container.style.pointerEvents = 'none'
    document.body.appendChild(container)
    this.managerContainer = container

    const shadowRoot = container.attachShadow({ mode: 'open' })

    const styleElement = document.createElement('style')
    styleElement.textContent = mainStyles
    shadowRoot.appendChild(styleElement)

    const mountPoint = document.createElement('div')
    mountPoint.setAttribute('data-theme', 'light')
    mountPoint.style.pointerEvents = 'auto'
    shadowRoot.appendChild(mountPoint)

    this.managerApp = createApp(ExtractTaskManager)
    this.managerApp.mount(mountPoint)
  }

  private unmountManager() {
    this.managerApp?.unmount()
    this.managerApp = null
    this.managerContainer?.remove()
    this.managerContainer = null
  }
}
