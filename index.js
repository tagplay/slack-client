'use strict'

const config = require('prefect-worker-config')
const got = require('got')

const log = config.log

module.exports = SlackAPI

function SlackAPI (accessToken, userAccessToken) {
  this.client = got.extend({
    baseUrl: 'https://slack.com/api/',
    json: true
  })

  this.accessToken = accessToken
  this.userAccessToken = userAccessToken
}

SlackAPI.prototype.callAPI = async function callAPI (path, options) {
  try {
    const response = await this.client(path, options)
    if (response.body.ok) {
      return [null, response.body]
    } else {
      log.warn({ response: response.body }, 'Got Slack error')
      return [new Error(response.body.error), undefined]
    }
  } catch (err) {
    log.warn({ err, url: err.url }, 'Got error calling Slack API')
    return [err, undefined]
  }
}

SlackAPI.prototype.post = async function post (path, body, token) {
  if (!token) token = this.accessToken
  log.info({ path, body, token }, 'About to make POST request')
  return this.callAPI(path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json;charset=utf-8'
    },
    body
  })
}

SlackAPI.prototype.get = async function get (path, params, token) {
  if (!token) token = this.accessToken
  params.token = token

  return this.callAPI(path, {
    method: 'GET',
    query: params
  })
}

SlackAPI.prototype.getPaginated = async function getPaginated (
  path,
  params,
  token
) {
  const [err, result] = await this.get(path, params, token)

  if (err) {
    return [err, result]
  }

  if (result.response_metadata && result.response_metadata.next_cursor) {
    const [nextErr, nextPage] = await this.getPaginated(
      path,
      { ...params, cursor: result.response_metadata.next_cursor },
      token
    )

    if (nextErr) {
      return [nextErr, undefined]
    }
    return [null, result.concat(nextPage)]
  }

  return [null, result]
}

SlackAPI.prototype.getChannels = async function getChannels () {
  return this.getPaginated('conversations.list', {}, this.accessToken)
}

SlackAPI.prototype.getMembers = async function getMembers () {
  return this.getPaginated('users.list', {}, this.accessToken)
}

SlackAPI.prototype.filePublicUrl = async function filePublicUrl (fileId) {
  // Note: this method requires a user access token.
  return this.post(
    'files.sharedPublicURL',
    {
      file: fileId
    },
    this.userAccessToken
  )
}

SlackAPI.prototype.userInfo = async function userInfo (userId) {
  return this.get('users.info', {
    user: userId
  })
}

SlackAPI.prototype.getPermalink = async function getPermalink (
  channelId,
  messageId
) {
  return this.get('chat.getPermalink', {
    channel: channelId,
    message_ts: messageId
  })
}

SlackAPI.prototype.postMessage = async function postMessage (
  channel,
  text,
  mrkdwn,
  attachments
) {
  return this.post('chat.postMessage', {
    channel: channel,
    text: text,
    attachments: attachments,
    mrkdwn: mrkdwn,
    as_user: false
  })
}

SlackAPI.prototype.openDirectMessage = async function openDirectMessage (user) {
  return this.post('conversations.open', {
    users: user
  })
}

SlackAPI.prototype.getBotInfo = async function getBotInfo (botId) {
  return this.get('bots.info', {
    bot: botId
  })
}
