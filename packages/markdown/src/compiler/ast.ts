import type { BlockContent, Data, RootContent } from 'mdast'
import type { Properties } from 'hast'
import type { Parent } from 'unist'

interface TabItemData extends Data {
  tabLabel: string
  tabLanguage?: string
  tabValue: string
  tabIndex: number
}

export interface TabItem extends Parent {
  type: 'tabItem'
  data: TabItemData
  children: BlockContent[]
}

interface TabGroupData extends Data {
  tabGroupLabel: string
  tabGroupKind: 'tabs' | 'code-group'
}

export interface TabGroup extends Parent {
  type: 'tabGroup'
  data: TabGroupData
  children: TabItem[]
}

interface StepItemData extends Data {
  stepTitle: string
  stepIndex: number
}

export interface StepItem extends Parent {
  type: 'stepItem'
  data: StepItemData
  children: BlockContent[]
}

interface StepGroupData extends Data {
  stepLabel: string
}

export interface StepGroup extends Parent {
  type: 'stepGroup'
  data: StepGroupData
  children: StepItem[]
}

export interface CalloutPart extends Parent {
  type: 'calloutBody' | 'calloutTitle'
  children: RootContent[]
}

declare module 'unist' {
  interface Data {
    directiveLabel?: boolean | null
    hName?: string
    hProperties?: Properties
  }
}

declare module 'mdast' {
  interface BlockContentMap {
    tabGroup: TabGroup
    tabItem: TabItem
    stepGroup: StepGroup
    stepItem: StepItem
    calloutPart: CalloutPart
  }

  interface RootContentMap {
    tabGroup: TabGroup
    tabItem: TabItem
    stepGroup: StepGroup
    stepItem: StepItem
    calloutPart: CalloutPart
  }
}
