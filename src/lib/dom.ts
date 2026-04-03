export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') node.className = v
      else if (k.startsWith('data-')) node.setAttribute(k, v)
      else node.setAttribute(k, v)
    }
  }
  if (children) {
    for (const child of children) {
      node.append(typeof child === 'string' ? document.createTextNode(child) : child)
    }
  }
  return node
}

export function text(str: string): Text {
  return document.createTextNode(str)
}

export function qs<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel)
}

export function qsa<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel))
}
