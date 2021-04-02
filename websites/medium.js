const { URL } = require('url')
const fetch = require('node-fetch')
const { JSDOM } = require('jsdom')
const { extract } = require('article-parser')

module.exports = {
  test(url) {
    let parsed = new URL(url)
    return parsed.hostname.endsWith('medium.com')
  },

  async process(url) {
    const article = await extract(url)
    if (!article) {
      throw new Error('default handler error')
    }
    let title = article.title
    let author = article.author
    let dom = new JSDOM(`<!DOCTYPE html><body>${article.content}</body>`).window.document.querySelector('body')
    dom = this.processDOM(dom)
    return {
      title,
      author,
      dom
    }
  },

  processDOM(content) {
    content.querySelectorAll('pre').forEach(pre => {
      const document = new JSDOM().window.document;
      const codes = []
      // collect codes
      pre.childNodes.forEach((node, index) => {
        if (node.nodeName === 'CODE') {
          codes.push(node.textContent)
          return
        }
        // multiple <span>...</span>
        if (index > 0) {
          codes.push('\n');
        }
        node.childNodes.forEach(v => {
          if (v.nodeName === 'BR') {
            codes.push('\n');
          } else {
            codes.push(v.textContent);
          }
        })
      })
      const codeBlock = document.createElement('code')
      codeBlock.appendChild(document.createTextNode(codes.join('')))
      // replace old children of pre
      while (pre.firstChild) {
        pre.removeChild(pre.firstChild);
      }
      pre.appendChild(codeBlock);
    })
    return content
  },

  samples: [
    // 'https://copyconstruct.medium.com/bash-redirection-fun-with-descriptors-e799ec5a3c16',
    'https://rakyll.medium.com/things-i-wished-more-developers-knew-about-databases-2d0178464f78',
  ]

}