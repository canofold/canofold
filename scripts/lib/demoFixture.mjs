import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Executable component-library workload, not padding modules or repeated empty Demos. */
export async function writeDemoFixture(root, pages, demosPerPage) {
  const stats = {
    components: pages,
    pages,
    demos: pages * demosPerPage,
    sourceModules: 0,
    sourceLines: 0,
    sourceBytes: 0,
    documentationBytes: 0
  }
  const write = async (path, source) => {
    if (/\.[cm]?[jt]sx?$/.test(path)) {
      stats.sourceModules++
      stats.sourceLines += source.split('\n').length
      stats.sourceBytes += Buffer.byteLength(source)
    }
    if (path.endsWith('.md')) stats.documentationBytes += Buffer.byteLength(source)
    await writeFile(join(root, path), source)
  }
  await mkdir(join(root, 'src/demos'), { recursive: true })
  await mkdir(join(root, 'src/shared'), { recursive: true })
  await mkdir(join(root, 'docs'))
  await write(
    'src/shared/context.tsx',
    `import { createContext, useContext, useMemo } from 'react'
const Context = createContext({density:'normal',locale:'en',currency:'USD'})
export function FixtureProvider({density,children}) {
  const value = useMemo(()=>({density,locale:'en',currency:'USD'}),[density])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useFixture() { return useContext(Context) }
`
  )
  await write(
    'src/shared/format.ts',
    `const formatter = new Intl.NumberFormat('en',{maximumFractionDigits:2})
export const formatScore = (value) => formatter.format(value)
export const filterRows = (rows,query) => rows.filter(row => row.label.toLowerCase().includes(query.toLowerCase()))
export const sortRows = (rows,descending) => [...rows].sort((a,b)=>(descending?-1:1)*a.label.localeCompare(b.label))
`
  )
  await write(
    'src/style.css',
    'button { color: rgb(102, 51, 153) }\ninput, select { padding: 6px; }\ntable { width: 100%; border-collapse: collapse; }\nth, td { padding: 6px; border-bottom: 1px solid #ddd; }'
  )
  const exports = []
  const families = ['table', 'form', 'tree', 'dialog']
  for (let index = 0; index < pages; index++) {
    const family = families[index % families.length]
    const directory = `src/components/component-${index}`
    await mkdir(join(root, directory), { recursive: true })
    exports.push(`export { Component${index} } from './components/component-${index}/component'`)
    await write(
      `${directory}/types.ts`,
      `export interface Item { value:number; label:string; score:number; group:string; active:boolean }
export interface ComponentProps { rows:Item[]; title:string; disabled?:boolean; pageSize?:number }
export type Action = {type:'query';value:string}|{type:'sort'}|{type:'page';value:number}|{type:'field';name:string;value:string}|{type:'submitted'}
`
    )
    await write(
      `${directory}/model.ts`,
      `import type { Action, Item } from './types'
import { filterRows, sortRows } from '../../shared/format'
export const initialState = {query:'',descending:false,page:0,fields:{name:'',email:''},submitted:false}
export function reducer(state:typeof initialState,action:Action) {
  switch(action.type) {
    case 'query': return {...state,query:action.value,page:0}
    case 'sort': return {...state,descending:!state.descending}
    case 'page': return {...state,page:action.value}
    case 'field': return {...state,fields:{...state.fields,[action.name]:action.value},submitted:false}
    case 'submitted': return {...state,submitted:true}
  }
}
export function selectRows(rows:Item[],query:string,descending:boolean) {
  return sortRows(filterRows(rows,query),descending)
}
export function validate(fields:typeof initialState.fields) {
  return {name:fields.name.trim()?'':'Name is required',email:fields.email.includes('@')?'':'Email is invalid'}
}
`
    )
    await write(
      `${directory}/hooks.ts`,
      `import { useDeferredValue, useMemo, useReducer, useState } from 'react'
import { initialState, reducer, selectRows, validate } from './model'
import type { Item } from './types'
export function useModel(rows:Item[],pageSize=8) {
  const [state,dispatch] = useReducer(reducer,initialState)
  const deferred = useDeferredValue(state.query)
  const filtered = useMemo(()=>selectRows(rows,deferred,state.descending),[rows,deferred,state.descending])
  const visible = useMemo(()=>filtered.slice(state.page*pageSize,(state.page+1)*pageSize),[filtered,state.page,pageSize])
  const errors = useMemo(()=>validate(state.fields),[state.fields])
  const [selected,setSelected] = useState<number[]>([])
  const toggle = (value:number) => setSelected(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value])
  return {state,dispatch,filtered,visible,errors,selected,toggle,pageSize}
}
`
    )
    await write(
      `${directory}/selection.tsx`,
      `import { createContext, useContext } from 'react'
const Context = createContext<number[]>([])
export function SelectionProvider({selected,children}) { return <Context.Provider value={selected}>{children}</Context.Provider> }
export function useSelection() { return useContext(Context) }
`
    )
    await write(
      `${directory}/parts.tsx`,
      `import { Search, ChevronRight } from 'lucide-react'
import { useFixture } from '../../shared/context'
import { formatScore } from '../../shared/format'
import { useSelection } from './selection'
import styles from './style.module.css'
import '../../style.css'
export function Panel({title,children}) {
  const fixture = useFixture()
  return <section className={styles.panel} data-density={fixture.density}><h3>{title}</h3>{children}</section>
}
export function Summary({count}) {
  const selected = useSelection()
  return <output className={styles.summary}>{count} records / {selected.length} selected</output>
}
export function SearchField({value,onChange}) {
  return <label className={styles.search}><Search aria-hidden size={14}/>Filter rows<input aria-label="Filter rows" value={value} onChange={onChange}/></label>
}
export function Score({value}) { return <span className={styles.score}>{formatScore(value)}</span> }
export function Branch({label,expanded,onToggle,children}) {
  return <li><button type="button" aria-expanded={expanded} onClick={onToggle}><ChevronRight size={12}/>{label}</button>{expanded?<ul>{children}</ul>:null}</li>
}
`
    )
    await write(
      `${directory}/details.tsx`,
      `import { Panel, Score } from './parts'
export default function Details() { return <Panel title="Lazy details ${index}"><p>This panel is requested only after opening details.</p><Score value={1234.56}/></Panel> }
`
    )
    await write(
      `${directory}/style.module.css`,
      `.panel { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-block: 10px; background: #fff; color: #222; }
.summary { display: block; margin-top: 8px; font-variant-numeric: tabular-nums; }
.search { display: flex; gap: 8px; align-items: center; margin-block: 8px; }
.score { font-variant-numeric: tabular-nums; }
`
    )
    const bodies = {
      table: `const model = useModel(rows)
  return <SelectionProvider selected={model.selected}><Panel title={title}>
    <SearchField value={model.state.query} onChange={event=>model.dispatch({type:'query',value:event.target.value})}/>
    <table aria-label="Records"><thead><tr><th>Select</th><th><button onClick={()=>model.dispatch({type:'sort'})}>Sort by name</button></th><th>Score</th><th>Group</th></tr></thead>
      <tbody>{model.visible.map(row=><tr key={row.value}>
        <td><input type="checkbox" aria-label={'Select '+row.label} checked={model.selected.includes(row.value)} onChange={()=>model.toggle(row.value)}/></td>
        <td>{row.label}</td><td><Score value={row.score}/></td><td>{row.group}</td>
      </tr>)}</tbody></table>
    <button disabled={model.state.page===0} onClick={()=>model.dispatch({type:'page',value:model.state.page-1})}>Previous page</button>
    <button disabled={(model.state.page+1)*model.pageSize>=model.filtered.length} onClick={()=>model.dispatch({type:'page',value:model.state.page+1})}>Next page</button>
    <Summary count={model.filtered.length}/>
  </Panel></SelectionProvider>`,
      form: `const model = useModel(rows)
  const id = useId()
  return <Panel title={title}><form onSubmit={event=>{event.preventDefault();model.dispatch({type:'submitted'})}}>
    {['name','email'].map(name=><div key={name}><label htmlFor={id+name}>{name}</label>
      <input id={id+name} name={name} value={model.state.fields[name]} onChange={event=>model.dispatch({type:'field',name,value:event.target.value})}/>
      {model.state.submitted && model.errors[name]?<p role="alert">{model.errors[name]}</p>:null}
    </div>)}
    <label>Category<select defaultValue={rows[0].group}>{[...new Set(rows.map(row=>row.group))].map(group=><option key={group}>{group}</option>)}</select></label>
    <button type="submit">Save form</button>
    {model.state.submitted && !model.errors.name && !model.errors.email?<output>Form saved</output>:null}
  </form></Panel>`,
      tree: `const model = useModel(rows)
  const [expanded,setExpanded] = useState<string[]>([])
  const groups = useMemo(()=>[...new Set(model.filtered.map(row=>row.group))],[model.filtered])
  return <SelectionProvider selected={model.selected}><Panel title={title}>
    <SearchField value={model.state.query} onChange={event=>model.dispatch({type:'query',value:event.target.value})}/>
    <ul aria-label="Record tree">{groups.map(group=><Branch key={group} label={group} expanded={expanded.includes(group)} onToggle={()=>setExpanded(current=>current.includes(group)?current.filter(value=>value!==group):[...current,group])}>
      {model.filtered.filter(row=>row.group===group).map(row=><li key={row.value}><label><input type="checkbox" checked={model.selected.includes(row.value)} onChange={()=>model.toggle(row.value)}/>{row.label}</label></li>)}
    </Branch>)}</ul><Summary count={model.filtered.length}/>
  </Panel></SelectionProvider>`,
      dialog: `const model = useModel(rows)
  const [open,setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {setOpen(false);trigger.current?.focus()}
  useEffect(()=>{
    if(!open)return
    const onKey = (event:KeyboardEvent) => {if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('keydown',onKey)
    return ()=>document.removeEventListener('keydown',onKey)
  },[open])
  return <Panel title={title}><button ref={trigger} onClick={()=>setOpen(true)}>Open dialog</button>
    {open?createPortal(<div role="dialog" aria-label="Record details"><Panel title="Record details"><button onClick={close}>Close dialog</button>
      <SearchField value={model.state.query} onChange={event=>model.dispatch({type:'query',value:event.target.value})}/>
      <ul>{model.visible.map(row=><li key={row.value}>{row.label}: <Score value={row.score}/></li>)}</ul>
    </Panel></div>,document.body):null}
  </Panel>`
    }
    await write(
      `${directory}/component.tsx`,
      `import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentProps } from './types'
import { useModel } from './hooks'
import { SelectionProvider } from './selection'
import { Panel, SearchField, Score, Summary, Branch } from './parts'
export function Component${index}({rows,title}:ComponentProps) {
  ${bodies[family]}
}
`
    )
    const directives = []
    for (let demo = 0; demo < demosPerPage; demo++) {
      const name = `${index}-${demo}`
      directives.push(
        `::demo[Example ${name}]{src="/src/demos/${name}.tsx"${demo === demosPerPage - 1 ? ' sandbox="iframe"' : ''}}`
      )
      await write(
        `src/demos/${name}.tsx`,
        `import { lazy, Suspense, useState } from 'react'
import { Component${index} } from '../index'
import { FixtureProvider } from '../shared/context'
const Details = lazy(()=>import('../components/component-${index}/details'))
const options = [
${Array.from({ length: 60 }, (_, item) => `  {label:'Option ${name}-${item}',value:${item},score:${item * 13.7},group:'Group ${item % 5}',active:${item % 2 === 0}},`).join('\n')}
]
export default function Demo() {
  const [count,setCount] = useState(0)
  const [details,setDetails] = useState(false)
  return <FixtureProvider density={count%2?'compact':'normal'}><section aria-label="Example ${name}">
    <button onClick={()=>setCount(value=>value+1)}>Example ${name}: {options[count%options.length].label}</button>
    <Component${index} rows={options} title="${family} ${name}"/>
    <button onClick={()=>setDetails(value=>!value)}>Toggle lazy details</button>
    {details?<Suspense fallback={<p>Loading details</p>}><Details/></Suspense>:null}
  </section></FixtureProvider>
}
`
      )
    }
    const api = Array.from(
      { length: 24 },
      (_, property) =>
        `| ${property === 0 ? 'rows' : `option${property}`} | \`string\` / \`number\` | Optional | Controls ${family} behavior ${property}. |`
    ).join('\n')
    await write(
      `docs/${index === 0 ? 'index' : `component-${index}`}.md`,
      `---
title: Component ${index}
description: Interactive ${family}, including controlled state, validation and composition.
---
# Component ${index}

## Overview

This ${family} supports controlled updates and nested composition. Each example runs independently; the final example is isolated in an iframe.

## Examples

${directives.join('\n\n')}

## API

| Property | Type | Required | Description |
| --- | --- | --- | --- |
${api}

## Controlled usage

\`\`\`tsx
import { Component${index} } from 'component-library'
import type { ComponentProps } from './types'
const rows: ComponentProps['rows'] = [{value:0,label:'First record',score:42,group:'A',active:true}]
export function ControlledExample() {
  return <Component${index} title="Controlled ${family}" rows={rows}/>
}
\`\`\`

## Accessibility

Inputs have labels, actions use native buttons, and dialogs expose their role. Test focus restoration and keyboard behavior when integrating composed content.

## Styling

Component styles use CSS Modules and shared tokens. Lazy details load on demand; changing shared styles updates both inline and iframe examples.
`
    )
  }
  await write('src/index.ts', exports.join('\n'))
  return stats
}
