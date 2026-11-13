/**
 * 批量为 Detail / Related 抽屉补 zIndex prop 与 el-drawer 绑定（UTF-8）。
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src/components')
const files = fs.readdirSync(root).filter((f) => {
  if (!f.endsWith('.vue')) return false
  return f.includes('DetailDrawer') || f.startsWith('Related')
})

function ensureDrawerBind(src) {
  return src.replace(/<el-drawer(\s[^>]*)?>/g, (full) => {
    let tag = full
    if (!/\bappend-to-body\b/.test(tag)) {
      tag = tag.replace(/>$/, '\n    append-to-body\n  >')
    }
    if (!/:z-index=/.test(tag)) {
      tag = tag.replace(/>$/, '\n    :z-index="zIndex"\n  >')
    }
    return tag
  })
}

function ensureProp(src) {
  if (/zIndex\??\s*:/.test(src) || /zIndex\?:/.test(src)) return src

  // withDefaults(defineProps<{ ... }>(), { ... })
  const wd = src.indexOf('withDefaults(')
  if (wd >= 0) {
    const propsStart = src.indexOf('defineProps<{', wd)
    if (propsStart < 0) return src
    const brace = src.indexOf('{', propsStart + 'defineProps<'.length)
    const close = src.indexOf('}>', brace)
    if (brace < 0 || close < 0) return src
    const insertAt = close
    src =
      src.slice(0, insertAt) +
      '\n    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */\n    zIndex?: number\n  ' +
      src.slice(insertAt)

    // defaults object after }, {
    const afterProps = src.indexOf('}>()', insertAt)
    const defaultsStart = src.indexOf('{', afterProps)
    const defaultsEnd = src.indexOf('}', defaultsStart)
    if (defaultsStart > 0 && defaultsEnd > defaultsStart) {
      const inside = src.slice(defaultsStart + 1, defaultsEnd)
      if (!inside.includes('zIndex')) {
        const trimmed = inside.replace(/\s*$/, '')
        const needsComma = trimmed.length > 0 && !trimmed.trimEnd().endsWith(',')
        src =
          src.slice(0, defaultsEnd) +
          `${needsComma ? ',' : ''}\n    zIndex: undefined,\n  ` +
          src.slice(defaultsEnd)
      }
    }
    return src
  }

  // defineProps<{ ... }>()
  const dp = src.indexOf('defineProps<{')
  if (dp >= 0) {
    const brace = src.indexOf('{', dp + 'defineProps<'.length)
    const close = src.indexOf('}>', brace)
    if (brace >= 0 && close > brace) {
      src =
        src.slice(0, close) +
        '\n  /** 叠在其它弹窗／抽屉之上时传入更高 z-index */\n  zIndex?: number\n' +
        src.slice(close)
    }
  }
  return src
}

let n = 0
for (const f of files) {
  const p = path.join(root, f)
  let src = fs.readFileSync(p, 'utf8')
  if (!src.includes('<el-drawer')) continue
  const before = src
  src = ensureProp(src)
  src = ensureDrawerBind(src)
  if (src !== before) {
    fs.writeFileSync(p, src, 'utf8')
    n += 1
    console.log('patched', f)
  }
}
console.log('done', n)
