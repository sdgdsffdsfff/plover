'use strict';


const assert = require('assert');
const compose = require('koa-compose');
const pathToRegexp = require('path-to-regexp');
const is = require('is-type-of');

const util = require('../../util/util');

const logger = require('plover-logger')('plover:components/startup/middleware');


module.exports = function(app) {
  const settings = app.settings;
  const root = settings.applicationRoot;

  const list = settings.middlewares || [];
  for (let item of list) {
    // 默认级别为3
    if (typeof item === 'string') {
      item = { module: item, level: 3 };
    }

    // middleware域是为了兼容原来的配置
    // 建议使用module或modules属性
    let mws = item.module || item.modules || item.middleware;
    mws = Array.isArray(mws) ? mws : [mws];
    loadMiddlewares(app, root, mws, item);
  }
};


function loadMiddlewares(app, root, mws, options) {
  mws = mws.map(path => {
    let mw = util.loadModule(root, path);
    assert(typeof mw === 'function',
      'middleware should be function: ' + path);

    if (!is.generatorFunction(mw)) {
      mw = mw(app.config, app.server, app);
    }

    assert(is.generatorFunction(mw),
        'generator function required: ' + path);

    mw.$name = path;

    return mw;
  });

  let middleware = null;
  if (mws.length > 1) {
    middleware = compose(mws);
    middleware.$name = 'compose-' +
      mws.map(function(mw) {
        return mw.name || mw.$name;
      }).join('|');
  } else {
    middleware = mws[0];
  }

  if (options.match || options.method) {
    middleware = createProxy(middleware, options);
  }

  app.addMiddleware(middleware, options);
}


function createProxy(mw, options) {
  const re = options.match && pathToRegexp(options.match);
  const name = 'proxy-' + options.match +
      '->' + (mw.name || mw.$name);

  logger.info('create proxy middleware: %s -> %s', re, name);

  const result = function* (next) {
    if (!re || re.test(this.path)) {
      if (match(this, options.method)) {
        logger.debug('%s matches %s', this.path, name);
        yield* mw.call(this, next);
        return;
      }
    }

    yield* next;
  };

  result.$name = name;
  return result;
}


/*
 * 验证method是否有效
 */
function match(ctx, method) {
  if (!method) {
    return true;
  }

  const m = ctx.method.toLowerCase();
  if (Array.isArray(method)) {
    return method.indexOf(m) !== -1;
  }

  return method === m;
}

