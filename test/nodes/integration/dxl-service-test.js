'use strict'

var Buffer = require('buffer').Buffer
var dxl = require('@opendxl/dxl-client')
var catchNode = require('node-red/nodes/core/core/25-catch')
var functionNode = require('node-red/nodes/core/core/80-function')
var injectNode = require('node-red/nodes/core/core/20-inject')
var dxlClientNode = require('../../../nodes/dxl-client')
var dxlRequestNode = require('../../../nodes/dxl-request')
var dxlResponseNode = require('../../../nodes/dxl-response')
var dxlServiceNode = require('../../../nodes/dxl-service')
var nodeRedHelper = require('../../node-red-helper')
var testHelpers = require('../test-helpers')

describe('dxl service', function () {
  before(function (done) {
    nodeRedHelper.startServer(done)
  })

  afterEach(function () {
    nodeRedHelper.unload()
  })

  after(function (done) {
    nodeRedHelper.stopServer(done)
  })

  var nodesToLoad = [catchNode, functionNode, injectNode,
    dxlClientNode, dxlRequestNode, dxlResponseNode, dxlServiceNode]

  var clientNodeId = 'dxl.clientId'
  var flowTabId = 'dxl.flowTabId'
  var helperNodeId = 'dxl.helperId'
  var requestNodeId = 'dxl.requestId'
  var serviceNodeId = 'dxl.serviceId'

  var baseTestFlows = [
    {
      id: flowTabId,
      type: 'tab'
    },
    testHelpers.getClientNodeConfig(clientNodeId),
    {
      id: serviceNodeId,
      type: 'dxl-service in',
      name: 'my service',
      serviceType: 'dxl test service',
      client: clientNodeId,
      rules: [
        {
          payloadType: 'txt',
          topic: '/dxl-service-test/txt'
        },
        {
          payloadType: 'bin',
          topic: '/dxl-service-test/bin'
        },
        {
          payloadType: 'obj',
          topic: '/dxl-service-test/obj'
        },
        {
          payloadType: 'txt',
          topic: '/dxl-service-test/error'
        }
      ],
      outputs: 4,
      wires: [
        ['txt.function'],
        ['bin.function'],
        ['obj.function'],
        ['error.function']
      ],
      z: flowTabId
    },
    {
      func: 'msg.payload = "txt is: " + msg.payload; return msg;',
      id: 'txt.function',
      type: 'function',
      outputs: 1,
      wires: [['dxl.response']]
    },
    {
      func: 'msg.payload = Buffer.concat([msg.payload, Buffer.from([32])]); ' +
        'return msg;',
      id: 'bin.function',
      type: 'function',
      outputs: 1,
      wires: [['dxl.response']]
    },
    {
      func: 'msg.payload.other = "added by function"; return msg;',
      id: 'obj.function',
      type: 'function',
      outputs: 1,
      wires: [['dxl.response']]
    },
    {
      func: 'node.error(msg.payload, msg);',
      id: 'error.function',
      type: 'function',
      outputs: 1,
      wires: [['dxl.response']],
      z: flowTabId
    },
    {
      id: 'dxl.response',
      type: 'dxl-response out',
      client: clientNodeId
    },
    {
      id: 'dxl.serviceError',
      type: 'catch',
      scope: [serviceNodeId, 'error.function'],
      wires: [['dxl.response']],
      z: flowTabId
    },
    {
      id: 'dxl.requestError',
      type: 'catch',
      scope: [requestNodeId],
      wires: [[helperNodeId]],
      z: flowTabId
    },
    {
      id: helperNodeId,
      type: 'helper'
    }
  ]

  context('when payloadType set to txt', function () {
    it('should be sent properly through the DXL fabric', function (done) {
      var testFlows = baseTestFlows.slice()
      testFlows.push({
        id: requestNodeId,
        type: 'dxl request',
        topic: '/dxl-service-test/txt',
        returnType: 'txt',
        client: clientNodeId,
        wires: [[helperNodeId]]
      })

      var requestPayload = 'my request payload as a string'
      testFlows.push(testHelpers.getInjectNodeConfig(requestPayload,
        requestNodeId, 'txt'))

      testHelpers.loadNodeRed(nodesToLoad, testFlows,
        function () {
          var helperNode = nodeRedHelper.getNode(helperNodeId)
          helperNode.on('input', function (msg) {
            testHelpers.forwardOnError(function () {
              msg.should.have.property('payload', 'txt is: ' + requestPayload)
              msg.should.have.property('dxlResponse').instanceOf(dxl.Response)
              msg.should.have.property('dxlMessage').equal(msg.dxlResponse)
              done()
            }, done)
          })
        }, done)
    })
  })

  context('when payloadType set to bin', function () {
    it('should be sent properly through the DXL fabric', function (done) {
      var testFlows = baseTestFlows.slice()
      testFlows.push({
        id: requestNodeId,
        type: 'dxl request',
        topic: '',
        returnType: 'bin',
        client: clientNodeId,
        wires: [[helperNodeId]]
      })

      testFlows.push({
        id: 'dxl.setTopicId',
        func: 'msg.dxlTopic = "/dxl-service-test/bin"; return msg;',
        type: 'function',
        outputs: 1,
        wires: [[requestNodeId]]
      })

      var requestPayload = Buffer.from([0x01, 0xD1, 0x9A])
      testFlows.push(testHelpers.getInjectNodeConfig('[1,209,154]',
        'dxl.setTopicId', 'bin'))

      testHelpers.loadNodeRed(nodesToLoad, testFlows,
        function () {
          var helperNode = nodeRedHelper.getNode(helperNodeId)
          helperNode.on('input', function (msg) {
            testHelpers.forwardOnError(function () {
              msg.should.have.property('payload',
                Buffer.concat([requestPayload, Buffer.from([32])]))
              done()
            }, done)
          })
        }, done)
    })
  })

  context('when payloadType set to obj', function () {
    it('should be sent properly through the DXL fabric', function (done) {
      var testFlows = baseTestFlows.slice()
      testFlows.push({
        id: requestNodeId,
        type: 'dxl request',
        topic: '/dxl-service-test/obj',
        returnType: 'obj',
        client: clientNodeId,
        wires: [[helperNodeId]]
      })

      testFlows.push({
        id: 'dxl.setTopicId',
        func: 'msg.dxlTopic = "/should/be/overridden"; return msg;',
        type: 'function',
        outputs: 1,
        wires: [[requestNodeId]]
      })

      var requestPayload = { hello: 'how are you', fine: 'thanks' }
      testFlows.push(testHelpers.getInjectNodeConfig(
        JSON.stringify(requestPayload), 'dxl.setTopicId', 'obj'))

      testHelpers.loadNodeRed(nodesToLoad, testFlows,
        function () {
          var helperNode = nodeRedHelper.getNode(helperNodeId)
          helperNode.on('input', function (msg) {
            testHelpers.forwardOnError(function () {
              msg.should.have.property('payload', {
                hello: 'how are you',
                fine: 'thanks',
                other: 'added by function'
              })
              done()
            }, done)
          })
        }, done)
    })
  })

  context('when request payload is malformed', function () {
    it('should send an error response through the DXL fabric', function (done) {
      var testFlows = baseTestFlows.slice()
      testFlows.push({
        id: requestNodeId,
        type: 'dxl request',
        topic: '/dxl-service-test/obj',
        returnType: 'obj',
        client: clientNodeId,
        wires: [[helperNodeId]],
        z: flowTabId
      })

      var requestPayload = 'malformed json'
      testFlows.push(testHelpers.getInjectNodeConfig(requestPayload,
        requestNodeId, 'txt'))

      testHelpers.loadNodeRed(nodesToLoad, testFlows,
        function () {
          var helperNode = nodeRedHelper.getNode(helperNodeId)
          helperNode.on('input', function (msg) {
            testHelpers.forwardOnError(function () {
              msg.should.have.propertyByPath(
                'error', 'message').match(/malformed json/)
              msg.should.have.propertyByPath(
                'error', 'source', 'type').equal('dxl request')
              msg.should.have.propertyByPath('dxlResponse',
                'errorMessage').match(/malformed json/)
              msg.should.have.property('dxlMessage').equal(msg.dxlResponse)
              done()
            }, done)
          })
        }, done)
    })
  })

  context('when a node handling a service request generates an error',
    function () {
      it('should send an error response through the DXL fabric',
        function (done) {
          var testFlows = baseTestFlows.slice()
          testFlows.push({
            id: requestNodeId,
            type: 'dxl request',
            topic: '/dxl-service-test/error',
            returnType: 'obj',
            client: clientNodeId,
            wires: [[helperNodeId]],
            z: flowTabId
          })

          var requestPayload = 'really bad error (95)'
          testFlows.push(testHelpers.getInjectNodeConfig(requestPayload,
            requestNodeId, 'txt'))

          testHelpers.loadNodeRed(nodesToLoad, testFlows,
            function () {
              var helperNode = nodeRedHelper.getNode(helperNodeId)
              helperNode.on('input', function (msg) {
                testHelpers.forwardOnError(function () {
                  msg.should.have.propertyByPath(
                    'error', 'message').match(/really bad error \(95\)/)
                  msg.should.have.propertyByPath(
                    'error', 'source', 'type').equal('dxl request')
                  msg.should.have.propertyByPath('dxlResponse',
                    'errorCode').equal(95)
                  msg.should.have.propertyByPath('dxlResponse',
                    'errorMessage').equal('really bad error')
                  msg.should.have.property('dxlMessage').equal(msg.dxlResponse)
                  done()
                }, done)
              })
            }, done
          )
        }
      )
    }
  )

  context('when request cannot decode a response', function () {
    it('should generate a catchable error', function (done) {
      var testFlows = baseTestFlows.slice()
      testFlows.push({
        id: requestNodeId,
        type: 'dxl request',
        topic: '/dxl-service-test/txt',
        returnType: 'obj',
        client: clientNodeId,
        wires: [[helperNodeId]],
        z: flowTabId
      })

      var requestPayload = 'not a json string'
      testFlows.push(testHelpers.getInjectNodeConfig(requestPayload,
        requestNodeId, 'txt'))

      testHelpers.loadNodeRed(nodesToLoad, testFlows,
        function () {
          var helperNode = nodeRedHelper.getNode(helperNodeId)
          helperNode.on('input', function (msg) {
            testHelpers.forwardOnError(function () {
              msg.should.have.propertyByPath(
                'error', 'message').match(/txt is: not a json string/)
              msg.should.have.propertyByPath(
                'error', 'source', 'type').equal('dxl request')
              msg.should.have.property('dxlResponse').instanceOf(dxl.Response)
              msg.should.have.property('dxlMessage').equal(msg.dxlResponse)
              done()
            }, done)
          })
        }, done)
    })
  })
})
