
let { Octokit } = require('@octokit/rest')
let fetchArticle = require('./src/fetchArticle')
let renderToMarkdown = require('./src/renderToMarkdown')
let fetch = require('node-fetch')

require('dotenv').config()

let TOKEN = process.env.TOKEN
let REPOSITORY = process.env.REPOSITORY
let EVENT = process.env.EVENT
let FINISH_STATE = process.env.FINISH_STATE || 'open'
let FETCH_LABEL = process.env.FETCH_LABEL || 'fetch'
let [OWNER, REPO] = REPOSITORY.split('/')
let FETCHED_LABEL = 'fetched'

let octokit = new Octokit({
  auth: TOKEN
})

function checkSubmission(body) {
  //if (body.split("\n").length > 1) return false
  return true
}

async function getTasks() {
  if (EVENT) {
    console.log('getting single task')
    const body = JSON.parse(EVENT)
    const labels = (body.labels || [body.label]).map(x => x.name)
    console.log('labels: ' + labels)
    if (labels && labels.includes(FETCH_LABEL)) {
      const issue = body.issue
      return [issue]
    }
    return []
  } else {
    console.log('getting list of tasks')
    let { data } = await octokit.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      labels: FETCH_LABEL,
      state: 'open'
    })
    return data
  }
}

async function performTasks(list) {
  console.log('got ' + list.length + ' tasks')
  let promises = list.map(async (issue) => {
    try {
      if (!checkSubmission(issue.body || issue.title)) {
        throw "Invalid submission"
      }
      let url = issue.body.match(/(https?:\/\/[^ ]*)/)[1]
      let resp = await fetch(url)
      let articleData = await fetchArticle(resp.url)
      await octokit.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: renderToMarkdown(articleData)
      })
      await octokit.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: FINISH_STATE,
        title: articleData.title,
        labels: [FETCHED_LABEL]
      })
    } catch(error) {
      await octokit.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: `错误 ${error.toString()}`
      })
      await octokit.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: FINISH_STATE,
        labels: ['error']
      })
      throw error
    }
  })

  await Promise.all(promises)
}

async function perform() {
  let tasks = await getTasks()
  await performTasks(tasks)
}

perform()
