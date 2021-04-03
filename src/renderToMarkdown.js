let moment = require('moment')
let TurndownService = require('turndown')
const { JSDOM } = require('jsdom')

let turndownService = new TurndownService({
  codeBlockStyle: 'fenced'
})

function strip(str) {
  return str.replace(/(^\s*|\s*$)/g, '')
}

turndownService.addRule('improve-pre-not-include-code-tag', {
  filter: function (node, options) {
    if (node.nodeName === 'PRE' && node.firstChild) {
      console.info(node.firstChild.nodeName)
    }
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      (node.firstChild.nodeName === '#text' ||
        node.firstChild.nodeName === 'SPAN' ||
        (node.firstChild.nodeName === 'CODE' && node.childNodes.length > 1))
    )
  },
  replacement: function (content, node, options) {
    const pre = generateClearPreBlock(node);
    return fencedCodeBlockReplacement(content, pre, options)
  },
})

module.exports = function({title, author, publishTime, dom}) {
  let mdTitle = ''
  if (author) {
    mdTitle = `${strip(title)} by ${strip(author)}`
  } else {
    mdTitle = strip(title)
  }

  Array.from(dom.querySelectorAll('*')).map(element => {
    element.removeAttribute('class')
    element.removeAttribute('id')
    element.removeAttribute('style')
  })

  let mdPublishDate = publishTime ? moment(publishTime * 1000).utcOffset(8).format('YYYY-MM-DD') : '';

  let html = dom.innerHTML
  let mdBody = turndownService.turndown(html)

  mdBody = mdBody.replace(/@/g, '@ ')
  
  if (mdPublishDate) {
    return `${mdTitle}\n------\n**${mdPublishDate}**\n${mdBody}`
  } else {
    return `${mdTitle}\n------\n${mdBody}`
  }
}

function fencedCodeBlockReplacement(content, node, options) {
  var className = node.firstChild.getAttribute('class') || ''
  var language = (className.match(/language-(\S+)/) || [null, ''])[1]
  var code = node.firstChild.textContent

  var fenceChar = options.fence.charAt(0)
  var fenceSize = 3
  var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm')

  var match
  while ((match = fenceInCodeRegex.exec(code))) {
    if (match[0].length >= fenceSize) {
      fenceSize = match[0].length + 1
    }
  }

  var fence = repeat(fenceChar, fenceSize)

  return (
    '\n\n' + fence + language + '\n' +
    code.replace(/\n$/, '') +
    '\n' + fence + '\n\n'
  )
}

function indentedCodeBlockReplacement (content, node, options) {
  return (
    '\n\n    ' +
    node.firstChild.textContent.replace(/\n/g, '\n    ') +
    '\n\n'
  )
}

function generateClearPreBlock (node) {
  const document = new JSDOM().window.document;
  const preBlock = document.createElement('pre')
  const codeBlock = document.createElement('code')
  codeBlock.appendChild(document.createTextNode(node.textContent))
  preBlock.appendChild(codeBlock);
  return preBlock
}

function repeat (character, count) {
  return Array(count + 1).join(character)
}

function cleanAttribute (attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
}

turndownService.addRule('improve-inline-link', {
  filter: function (node, options) {
    return (
      options.linkStyle === 'inlined' &&
      node.nodeName === 'A' &&
      node.getAttribute('href')
    )
  },

  replacement: function (content, node) {
    var href = node.getAttribute('href')
    var title = cleanAttribute(node.getAttribute('title'))
    if (title) title = ' "' + title + '"'
    return '[' + content.trim() + '](' + href + title + ')'
  }
})
