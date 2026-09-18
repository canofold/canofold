export interface CanofoldDemoLabels {
  openPreview: string
  showSource: string
  hideSource: string
  loading: string
  failed: string
}

const english: CanofoldDemoLabels = {
  openPreview: 'Open in new window',
  showSource: 'Show source',
  hideSource: 'Hide source',
  loading: 'Loading example…',
  failed: 'This example could not be loaded.'
}

export function demoLabelsFor(locale: string): CanofoldDemoLabels {
  if (locale.toLowerCase().startsWith('zh')) {
    return {
      openPreview: '在新窗口打开',
      showSource: '查看代码',
      hideSource: '收起代码',
      loading: '正在加载示例…',
      failed: '示例加载失败。'
    }
  }
  return english
}
