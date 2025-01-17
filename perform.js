const { Octokit } = require('@octokit/rest')
const core = require('@actions/core')
const fetch = require('node-fetch')
const captureWebsite = require('capture-website');
const fetchArticle = require('./src/fetchArticle')
const renderToMarkdown = require('./src/renderToMarkdown')
const whichChrome = require('./src/which-chrome')

require('dotenv').config()

const RUN_ID = process.env.GITHUB_RUN_ID || (new Date()).getTime()
const TOKEN = process.env.TOKEN
const REPOSITORY = process.env.REPOSITORY
const EVENT = process.env.EVENT
const FINISH_STATE = process.env.FINISH_STATE || 'open'
const FETCH_LABEL = process.env.FETCH_LABEL || 'fetch'
const CAPTURE_LABEL = process.env.CAPTURE_LABEL || 'capture'
const CAPTURE_PDF_LABEL = process.env.CAPTURE_PDF_LABEL || 'capture-pdf'
const [OWNER, REPO] = REPOSITORY.split('/')
const FETCHED_LABEL = 'fetched'
const CAPTURED_LABEL = 'captured'
const ERROR_LABEL = 'error'
const FETCH_RELATED_LABELS = [FETCH_LABEL, FETCHED_LABEL, ERROR_LABEL]
const CAPTURE_RELATED_LABELS = [CAPTURE_LABEL, CAPTURED_LABEL, CAPTURE_PDF_LABEL]

const octokit = new Octokit({
  auth: TOKEN
})

function checkSubmission(body) {
  //if (body.split("\n").length > 1) return false
  return true
}

async function getTasks() {
  if (EVENT) {
    core.info('getting single task')
    const body = JSON.parse(EVENT)
    let labels = [body.label].filter(x => x)
    if (labels.length === 0) {
      labels = body.issue.labels || []
    }
    if (labels.length !== 0) {
      body.issue.updateLabels = labels
    }
    labels = body.issue.updateLabels || []
    const labelNames = labels.map(x => x.name)
    core.info('update labels: ' + labelNames)
    const issue = body.issue
    if (shouldFetch(issue) || shouldCapture(issue)) {
      return [issue]
    }
    return []
  } else {
    core.info('getting list of tasks')
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
  core.info('got ' + list.length + ' tasks')
  let promises = list.map(async (issue) => {
    try {
      if (!checkSubmission(issue.body || issue.title)) {
        throw "Invalid submission"
      }
      let url = issue.body.match(/(https?:\/\/[^ ]*)/)[1]

      // capture screenshot
      if (shouldCapture(issue)) {
        await captureScreenShot(issue, url)
      }
      if (!shouldFetch(issue)) {
        return
      }

      let resp = await fetch(url)
      let articleData = await fetchArticle(resp.url)
      await octokit.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: renderToMarkdown(articleData)
      })
      const latestIssue = await getLatestIssue(issue.number)
      await octokit.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: FINISH_STATE,
        title: articleData.title,
        labels: generateNewLabels(latestIssue.labels, [FETCHED_LABEL], FETCH_RELATED_LABELS)
      })
    } catch(error) {
      await octokit.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        body: `错误 ${error.toString()}`
      })
      const latestIssue = await getLatestIssue(issue.number)
      await octokit.issues.update({
        owner: OWNER,
        repo: REPO,
        issue_number: issue.number,
        state: FINISH_STATE,
        labels: generateNewLabels(latestIssue.labels, [ERROR_LABEL], FETCH_RELATED_LABELS)
      })
      throw error
    }
  })

  await Promise.all(promises)
}

async function captureScreenShot(issue, url) {
  core.info(`start capture screenshot for ${url}`)
  // Locate Google Chrome executable
  const executablePath = await whichChrome();
  core.info(`executablePath is ${executablePath}`);
  /* https://github.com/sindresorhus/capture-website#options */
  const [content, pdfContent] = await captureWebsite.base64(url, {
    launchOptions: {
      // executablePath,
    },
    inputType: 'url',
    width: 1280,
    height: 720,
    type: 'png',
    // quality: 1,
    scaleFactor: 2,
    fullPage: true,
    defaultBackground: true,
    timeout: 240,
    delay: 60,
    disableAnimations: false,
    isJavaScriptEnabled: true,
    generatePDF: true,
  })
  const now = new Date()
  const path = `screenshot/${now.getFullYear()}/${now.getMonth()}/${issue.number}-${RUN_ID}.png`
  const pdfPath = `${path}.pdf`
  if (shouldCaptureScreenShot(issue)) {
    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: path,
      message: `upload ${path}`,
      content: content,
    })
    core.info(`uploaded ${path}`)
    const image = `https://github.com/${OWNER}/${REPO}/raw/master/${path}`
    const link = `https://github.com/${OWNER}/${REPO}/blob/master/${path}`
    await octokit.issues.createComment({
      owner: OWNER,
      repo: REPO,
      issue_number: issue.number,
      body: `[![screenshot](${image})](${link})`
    })
  }

  // pdf
  if (shouldCapturePDF(issue)) {
    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: pdfPath,
      message: `upload ${pdfPath}`,
      content: pdfContent,
    })
    core.info(`uploaded ${pdfPath}`)
    const pdfLink = `https://github.com/${OWNER}/${REPO}/blob/master/${pdfPath}`
    await octokit.issues.createComment({
      owner: OWNER,
      repo: REPO,
      issue_number: issue.number,
      body: `[PDF](${pdfLink})`
    })
  }

  const latestIssue = await getLatestIssue(issue.number)
  await octokit.issues.update({
    owner: OWNER,
    repo: REPO,
    issue_number: issue.number,
    labels: generateNewLabels(latestIssue.labels, [CAPTURED_LABEL], CAPTURE_RELATED_LABELS)
  })
  core.info(`finished capture screenshot for ${url}`)
}

async function getLatestIssue(issueNumber) {
  const response = await octokit.issues.get({
    owner: OWNER,
    repo: REPO,
    issue_number: issueNumber,
  })
  core.info(`latest issue of ${issueNumber} is [response]:\n${JSON.stringify(response, null, 2)}\n`)
  const latestIssue = response.data
  core.info(`latest issue of ${issueNumber} is [latestIssue]:\n${JSON.stringify(latestIssue, null, 2)}\n`)
  return latestIssue
}

function generateNewLabels(existLabels, labels, removeLabels) {
  labels = labels || []
  const newLabels = (existLabels || []).map(x => x.name)
    .filter(x => !removeLabels.includes(x))
  labels.map(x => newLabels.push(x))
  return newLabels
}

function shouldFetch(issue) {
  const labels = issue.updateLabels || []
  const labelNames = labels.map(x => x.name)
  return labelNames && (labelNames.includes(FETCH_LABEL))
}

function shouldCapture(issue) {
  const labels = issue.updateLabels || []
  const labelNames = labels.map(x => x.name)
  return labelNames && (labelNames.includes(CAPTURE_LABEL) || labelNames.includes(CAPTURE_PDF_LABEL))
}

function shouldCaptureScreenShot(issue) {
  const labels = issue.updateLabels || []
  const labelNames = labels.map(x => x.name)
  return labelNames && (labelNames.includes(CAPTURE_LABEL))
}

function shouldCapturePDF(issue) {
  const labels = issue.updateLabels || []
  const labelNames = labels.map(x => x.name)
  return labelNames && (labelNames.includes(CAPTURE_PDF_LABEL))
}

async function perform() {
  let tasks = await getTasks()
  await performTasks(tasks)
}

perform()
