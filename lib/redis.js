/*!
 * kue - RedisClient factory
 * Copyright (c) 2013 Automattic <behradz@gmail.com>
 * Copyright (c) 2011 LearnBoost <tj@learnboost.com>
 * MIT Licensed
 * Author: behradz@gmail.com
 */

/**
 * Module dependencies.
 */

var redis = require('redis');
var url   = require('url');

/**
 *
 * @param options
 * @param queue
 */

exports.configureFactory = function( options, queue ) {
  options.prefix = options.prefix || 'q';

  if( typeof options.redis === 'string' ) {
    options.redis = { url: options.redis }
  }

  // support legacy passthrough of options
  if( options.redis && options.redis.options ) {
    Object.assign(options.redis, options.redis.options)
  }

  options.redis = options.redis || {};

  // guarantee that redis._client has not been populated.
  // may warrant some more testing - i was running into cases where shutdown
  // would call redis.reset but an event would be emitted after the reset
  // which would re-create the client and cache it in the redis module.
  exports.reset();

  /**
   * Create a RedisClient.
   *
   * @return {RedisClient}
   * @api private
   */
  exports.createClient = function() {
    var clientFactoryMethod = options.redis.createClientFactory || exports.createClientFactory;
    var client              = clientFactoryMethod(options);

    client.on('error', function( err ) {
      queue.emit('error', err);
    });

    client.prefix           = options.prefix;

    // redefine getKey to use the configured prefix
    client.getKey = function( key ) {
      if( client.constructor.name == 'Redis'  || client.constructor.name == 'Cluster') {
        // {prefix}:jobs format is needed in using ioredis cluster to keep they keys in same node
        // otherwise multi commands fail, since they use ioredis's pipeline.
        return '{' + this.prefix + '}:' + key;
      }
      return this.prefix + ':' + key;
    };

    client.createFIFO = function( id ) {
      //Create an id for the zset to preserve FIFO order
      var idLen = '' + id.toString().length;
      var len = 2 - idLen.length;
      while (len--) idLen = '0' + idLen;
      return idLen + '|' + id;
    };

    // Parse out original ID from zid
    client.stripFIFO = function( zid ) {
      if ( typeof zid === 'string' ) {
        return +zid.substr(zid.indexOf('|')+1);
      } else {
        // Sometimes this gets called with an undefined
        // it seems to be OK to have that not resolve to an id
        return zid;
      }
    };

    return client;
  };
};

/**
 * Create a RedisClient from options
 * @param options
 * @return {RedisClient}
 * @api private
 */

exports.createClientFactory = function( options ) {
 // socket used to be passed in explicitly as an option
  // convert it to how the redis client is looking for it sees it if present.
  options.path = options.redis.socket;
  return redis.createClient(options.redis);
};

/**
 * Create or return the existing RedisClient.
 *
 * @return {RedisClient}
 * @api private
 */

exports.client = function() {
  return exports._client || (exports._client = exports.createClient());
};

/**
 * Return the pubsub-specific redis client.
 *
 * @return {RedisClient}
 * @api private
 */

exports.pubsubClient = function() {
  return exports._pubsub || (exports._pubsub = exports.createClient());
};

/**
 * Resets internal variables to initial state
 *
 * @api private
 */
exports.reset = function() {
  exports._client && exports._client.quit();
  exports._pubsub && exports._pubsub.quit();
  exports._client = null;
  exports._pubsub = null;
};
