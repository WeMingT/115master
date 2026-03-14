/** DOM 提取的压缩文件信息 */
export interface ArchiveFileInfo {
  pickCode: string
  title: string
  fileSize: string
  cid: string
}

/** Push 阶段状态 */
export type PushStatus = 'pending' | 'pushing' | 'push_done' | 'need_password' | 'push_error'

/** Extract 阶段状态 */
export type ExtractStatus = 'idle' | 'extracting' | 'extract_done' | 'extract_error'

/** 单文件完整状态 */
export interface ExtractFileState {
  file: ArchiveFileInfo
  pushStatus: PushStatus
  extractStatus: ExtractStatus
  errorMessage: string
  /** push 成功后使用的密码 */
  usedPassword: string
}

/** 密码条目 */
export interface PasswordEntry {
  id: string
  value: string
}

/** Store 级别的任务（含解压目标 + 时间戳） */
export type ExtractTask = ExtractFileState & {
  /** 添加时间戳 */
  addedAt: number
  /** 解压目标目录 ID */
  targetCid: string
}

/** 可序列化的任务（用于 IndexedDB 持久化） */
export type SerializedExtractTask = ExtractTask
