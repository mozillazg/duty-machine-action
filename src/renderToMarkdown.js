let moment = require('moment')
let TurndownService = require('turndown')

let turndownService = new TurndownService({
  codeBlockStyle: 'fenced'
})

function strip(str) {
  return str.replace(/(^\s*|\s*$)/g, '')
}

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
