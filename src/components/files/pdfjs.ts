import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// worker 由构建产物提供地址，避免运行时依赖 CDN；legacy 版本兼容较旧的浏览器
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).href

export { pdfjs }
