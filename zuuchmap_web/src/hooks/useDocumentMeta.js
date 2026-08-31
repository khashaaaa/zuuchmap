import { useEffect } from 'react'

/**
 * Per-route title, description and social tags.
 *
 * `index.html` carries one set of tags for the whole app, so every route —
 * every listing — shared the landing page's title and blurb. Google renders
 * JavaScript, so setting them here fixes search; the crawlers that do not
 * (Facebook, Messenger, which is how links actually travel here) are served
 * pre-rendered tags by the engine instead, via nginx. Both halves are needed:
 * neither one covers the other's audience.
 *
 * Every tag it touches is restored on unmount, so navigating from a listing
 * back to browse does not leave the listing's description behind.
 */
const DEFAULTS = {
  title: 'ZuuchMap — Барилгын зах зээл | Машин механизм, материал, гүйцэтгэгч',
  description:
    'Монголын барилгын зах зээл. Машин механизм, тээврийн хэрэгсэл, багаж түрээслэх, барилгын материал, үйлдвэр, гүйцэтгэгч, ажлын байр, SOS үйлчилгээ — 21 аймагт.',
  image: 'https://zuuchmap.com/og.png',
}

function setTag(selector, attr, value) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    const [, key, name] = selector.match(/\[(.+?)="(.+?)"\]/) ?? []
    if (key && name) el.setAttribute(key, name)
    if (selector.startsWith('link')) el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  const previous = el.getAttribute(attr)
  el.setAttribute(attr, value)
  return () => {
    if (previous === null) el.remove()
    else el.setAttribute(attr, previous)
  }
}

/**
 * `url` is the canonical. When a page passes none, it is the current path
 * without query or hash — `index.html` used to ship a fixed canonical of `/`,
 * which told search engines that browse, every category landing and the policy
 * pages were duplicates of the homepage. Pages whose query IS the document
 * (`/browse?category=…`) pass an explicit url.
 */
export function useDocumentMeta({ title, description, image, url } = {}) {
  const finalTitle = title ? `${title} — ZuuchMap` : DEFAULTS.title
  const finalDescription = description || DEFAULTS.description
  const finalImage = image || DEFAULTS.image
  const finalUrl = url || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '')

  useEffect(() => {
    const previousTitle = document.title
    document.title = finalTitle

    const restores = [
      setTag('meta[name="description"]', 'content', finalDescription),
      setTag('meta[property="og:title"]', 'content', finalTitle),
      setTag('meta[property="og:description"]', 'content', finalDescription),
      setTag('meta[property="og:image"]', 'content', finalImage),
      setTag('meta[property="og:url"]', 'content', finalUrl),
      setTag('meta[name="twitter:title"]', 'content', finalTitle),
      setTag('meta[name="twitter:description"]', 'content', finalDescription),
      setTag('meta[name="twitter:image"]', 'content', finalImage),
      setTag('link[rel="canonical"]', 'href', finalUrl),
    ]

    return () => {
      document.title = previousTitle
      restores.forEach((restore) => restore())
    }
  }, [finalTitle, finalDescription, finalImage, finalUrl])
}

export default useDocumentMeta
