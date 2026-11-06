declare namespace chrome {
  namespace runtime {
    const onInstalled: { addListener(cb: () => void): void }
    const onStartup: { addListener(cb: () => void): void }
    const onMessage: {
      addListener(
        cb: (msg: any, sender: any, sendResponse: (res?: any) => void) => boolean | void,
      ): void
    }
    function sendMessage(msg: any): Promise<any>
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
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>
      set(items: Record<string, any>): Promise<void>
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
}
