import clsx from 'clsx'
import { createElement, memo, useMemo, type ReactNode } from 'react'
import type {
  BlockContent,
  DefinitionContent,
  List as ListNode,
  PhrasingContent,
} from 'mdast'
import { toMdAst } from '../../services/markdown/parse.js'
import { Link } from '../markdown/Link.js'
import styles from './UserMessage.module.css'

/**
 * 用户消息的 Markdown 渲染只保留常用格式：加粗、斜体、链接、无序/有序列表和标题。
 * 代码块、行内代码、表格、引用等一律按纯文本展示，避免把用户输入的代码包成代码框。
 */

// 按 \n 拆行插 <br>：保留用户输入的换行
const TextContent = memo(function TextContent({ children }: { children: string }) {
  const result: ReactNode[] = []
  children.split(/\r?\n/).forEach((line, index) => {
    result.push(<span key={`${index}s`}>{line}</span>, <br key={`${index}br`} />)
  })
  result.pop()
  return result
})

const InlineItem = memo(function InlineItem({ node }: { node: PhrasingContent }) {
  switch (node.type) {
    case 'text':
      return <TextContent>{node.value}</TextContent>
    case 'strong':
      return (
        <strong>
          <Inline nodes={node.children} />
        </strong>
      )
    case 'emphasis':
      return (
        <em>
          <Inline nodes={node.children} />
        </em>
      )
    case 'link':
      return (
        <Link node={node}>
          <Inline nodes={node.children} />
        </Link>
      )
    case 'break':
      return <br />
    case 'inlineCode':
      return <>{node.value}</>
    case 'image':
      return <>{node.alt ?? ''}</>
    case 'html':
      return <>{node.value}</>
    case 'inlineMath':
      return <>{node.value}</>
    default:
      return null
  }
})

const Inline = memo(function Inline({ nodes }: { nodes: PhrasingContent[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineItem key={index} node={node} />
      ))}
    </>
  )
})

const List = memo(function List({ node }: { node: ListNode }) {
  const ListTag = node.ordered ? 'ol' : 'ul'
  return (
    <ListTag start={node.ordered ? node.start || undefined : undefined}>
      {node.children.map((item, index) => (
        <li key={index}>
          <Blocks nodes={item.children} />
        </li>
      ))}
    </ListTag>
  )
})

/** 表格不在保留范围内，按行以纯文本展示 */
const PlainTable = memo(function PlainTable({ node }: { node: Extract<BlockContent, { type: 'table' }> }) {
  return (
    <div className={styles.plainTextBlock}>
      {node.children.map((row, rowIndex) => (
        <div key={rowIndex}>
          {row.children.map((cell, cellIndex) => (
            <span key={cellIndex}>
              {cellIndex > 0 ? ' | ' : null}
              <Inline nodes={cell.children} />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
})

const BlockItem = memo(function BlockItem({
  node,
}: {
  node: BlockContent | DefinitionContent
}) {
  switch (node.type) {
    case 'paragraph':
      return (
        <p className={styles.paragraph}>
          <Inline nodes={node.children} />
        </p>
      )
    case 'heading':
      return createElement(
        `h${node.depth}`,
        { className: styles.heading },
        <Inline nodes={node.children} />
      )
    case 'list':
      return <List node={node} />
    case 'code':
      return <div className={styles.plainTextBlock}>{node.value}</div>
    case 'blockquote':
      return <Blocks nodes={node.children} />
    case 'table':
      return <PlainTable node={node} />
    case 'html':
      return <div className={styles.plainTextBlock}>{node.value}</div>
    case 'math':
      return <div className={styles.plainTextBlock}>{node.value}</div>
    default:
      return null
  }
})

const Blocks = memo(function Blocks({
  nodes,
}: {
  nodes: Array<BlockContent | DefinitionContent>
}) {
  return (
    <>
      {nodes.map((node, index) => (
        <BlockItem key={index} node={node} />
      ))}
    </>
  )
})

export const UserMarkdown = memo(function UserMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const ast = useMemo(() => toMdAst(content, { sources: undefined, disableLink: false }), [content])
  return (
    <div className={clsx('ds-markdown', className)}>
      <Blocks nodes={ast.children as Array<BlockContent | DefinitionContent>} />
    </div>
  )
})
