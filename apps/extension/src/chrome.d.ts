declare namespace chrome {
  namespace runtime {
    const onInstalled: { addListener(cb: () => void): void }
    const onStartup: { addListener(cb: () => void): void }
    const onMessage: {
      addListener(
        cb: (
          msg: unknown,
          sender: MessageSender,
          sendResponse: (res?: unknown) => void,
        ) => boolean | void,
      ): void
    }
    interface MessageSender {
      id?: string
      url?: string
      tab?: chrome.tabs.Tab
    }
    function sendMessage(msg: unknown): Promise<unknown>
    function getURL(path: string): string
    const id: string
  }
  namespace declarativeNetRequest {
    interface RuleAction {
      type: string
      redirect?: { url?: string; extensionPath?: string }
    }
    interface RuleCondition {
      urlFilter?: string
      resourceTypes?: string[]
      domains?: string[]
      excludedDomains?: string[]
      requestDomains?: string[]
    }
    interface Rule {
      id: number
      priority: number
      action: RuleAction
      condition: RuleCondition
    }
    function getDynamicRules(): Promise<Rule[]>
    function updateDynamicRules(options: {
      removeRuleIds?: number[]
      addRules?: Rule[]
    }): Promise<void>
  }
  namespace storage {
    interface StorageArea {
      get(
        keys?: string | readonly string[] | Record<string, unknown> | null,
      ): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
    const local: StorageArea
  }
  namespace alarms {
    interface AlarmCreateInfo {
      delayInMinutes?: number
      periodInMinutes?: number
      when?: number
    }
    interface Alarm {
      name: string
      scheduledTime: number
      periodInMinutes?: number
    }
    function create(name: string, alarmInfo: AlarmCreateInfo): void
    const onAlarm: { addListener(cb: (alarm: Alarm) => void): void }
  }
  namespace tabs {
    interface Tab {
      id?: number
      url?: string
      title?: string
      status?: string
    }
    interface TabChangeInfo {
      status?: string
      url?: string
    }
    function update(tabId: number, updateProperties: { url?: string }): Promise<Tab>
    const onUpdated: {
      addListener(cb: (tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void): void
    }
  }
  namespace contextMenus {
    interface CreateProperties {
      id?: string
      title?: string
      contexts?: Array<'all' | 'page' | 'selection' | 'link' | 'image'>
      parentId?: string
    }
    interface OnClickData {
      menuItemId: string | number
      selectionText?: string
      linkUrl?: string
      pageUrl?: string
    }
    function create(createProperties: CreateProperties, callback?: () => void): void
    function removeAll(callback?: () => void): void
    const onClicked: {
      addListener(cb: (info: OnClickData, tab?: tabs.Tab) => void): void
    }
  }
  namespace webNavigation {
    interface BeforeNavigateDetails {
      tabId: number
      url: string
      processId?: number
      frameId: number
      parentFrameId?: number
      timeStamp: number
    }
    const onBeforeNavigate: {
      addListener(cb: (details: BeforeNavigateDetails) => void): void
    }
  }
}
