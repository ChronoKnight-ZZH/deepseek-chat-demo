import { useEffect, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

/**
 * 把 PDF 原件交给 pdf.js 解析；blob 变化或组件卸载时销毁文档。
 * pdf.js 体积较大，放到打开 PDF 时再异步加载。
 */
export const usePdfDocument = (blob: Blob | null) => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setDoc(null)
    setFailed(false)
    if (!blob) {
      return
    }

    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null

    const load = async () => {
      try {
        const { pdfjs } = await import('./pdfjs.js')
        if (cancelled) {
          return
        }
        task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        const loaded = await task.promise
        if (cancelled) {
          void loaded.destroy()
          return
        }
        setDoc(loaded)
      } catch {
        if (!cancelled) {
          setFailed(true)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [blob])

  return { doc, failed }
}
