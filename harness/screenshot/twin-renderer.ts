import puppeteer from 'puppeteer'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { resolve, extname } from 'path'
import type { Page } from '../../src/types.ts'
import { paths } from '../config.ts'
import { screenshotPath } from '../store/artifacts.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

let serverInstance: ReturnType<typeof createServer> | null = null
let serverPort = 0

/** Start a static file server for the built twin */
function startServer(distDir: string): Promise<number> {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const url = req.url === '/' ? '/index.html' : req.url ?? '/index.html'
      const filePath = resolve(distDir, url.slice(1))
      if (existsSync(filePath)) {
        const ext = extname(filePath)
        resp.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        resp.end(readFileSync(filePath))
      } else {
        // SPA fallback
        resp.writeHead(200, { 'Content-Type': 'text/html' })
        resp.end(readFileSync(resolve(distDir, 'index.html')))
      }
    })
    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      serverInstance = server
      serverPort = port
      res(port)
    })
  })
}

function stopServer(): void {
  serverInstance?.close()
  serverInstance = null
}

/** Screenshot a single twin page */
export async function screenshotTwinPage(
  page: Page,
  chapter: number,
  iteration: number
): Promise<string> {
  if (!serverPort) {
    await startServer(paths.dist)
  }

  const browser = await puppeteer.launch({ headless: true })
  const browserPage = await browser.newPage()
  await browserPage.setViewport({ width: 1200, height: 1400 })
  await browserPage.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' })

  // Inject page data via the harness hook
  await browserPage.evaluate((pageJson: Page) => {
    const harness = (window as Record<string, unknown>).__harness as {
      loadPage: (p: Page) => void
    }
    harness.loadPage(pageJson)
  }, page)

  // Wait for render
  await browserPage.waitForSelector('.page-sheet', { timeout: 5000 })
  await new Promise((r) => setTimeout(r, 500)) // let layout settle

  // Screenshot the page sheet
  const sheetEl = await browserPage.$('.page-sheet')
  const outPath = screenshotPath(chapter, page.page, iteration)

  if (sheetEl) {
    await sheetEl.screenshot({ path: outPath })
  } else {
    await browserPage.screenshot({ path: outPath, fullPage: true })
  }

  await browser.close()
  return outPath
}

/** Cleanup server when done */
export function shutdownRenderer(): void {
  stopServer()
}
