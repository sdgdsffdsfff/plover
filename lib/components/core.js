'use strict';


const http = require('http');
const assert = require('assert');
const antsort = require('antsort');
const is = require('is-type-of');


const logger = require('plover-logger')('plover:components/core');


class Core {

  /**
   * 定义核心方法和核心中间件
   * 以及通用异常处理
   *
   * @param {PloverApplication} app - plover应用对象
   */
  constructor(app) {
    this.app = app;

    // 中间件
    this.middlewares = [];

    this.addMiddleware(require('../util/error-handler'), 0);

    // 暴露公共方法
    this.exports = [
      'start',
      'listen',
      'callback',
      'middleware',
      'addMiddleware'
    ];
  }


  /**
   * 用于启动应用
   * 1. 初始化所有中间件
   * 2. 注册到koa容器中
   *
   * @param {Function} fn  - [可选] 回调方法，初始化完成时会自动调用此回调
   * @return {Promise}     - 如果`fn`为空，则返回一个Promise对象
   *
   * @since 1.0
   */
  start(fn) {
    const app = this.app;

    if (!this.isStart) {
      this.isStart = true;

      const items = prepareMiddlewares(app, this.middlewares);
      // PloverApplication子类可以实现$mountMiddlewres来介入中间件的组装
      if (app.$mountMiddlewares) {
        app.$mountMiddlewares(app.server, items);
      } else {
        mountMiddlewares(app.server, items);
      }
    }

    // app.ready会判断参数个数，因此不能简写
    return fn ? app.ready(fn) : app.ready();
  }


  /**
   * 方便以中间件方式接入到其他koa应用
   *
   * @return {Middleware} - 中间件
   */
  middleware() {
    const compose = require('koa-compose');
    this.start();
    return compose(this.app.server.middleware);
  }


  /**
   * 方便快捷启动服务
   *
   * @param {Number} port     - 端口号
   * @param {Number} hostname - hostname
   * @return {Promise}        - promise
   *
   * @since 1.0
   */
  listen(port, hostname) {
    return this.start().then(() => {
      const fn = this.app.server.callback();
      const server = http.createServer(fn);
      return new Promise(resolve => {
        server.listen(port, hostname, null, () => {
          resolve(server);
        });
      });
    });
  }


  /**
   * 方便单元测试等场景
   *
   * @return {function(req, res)} - callback
   *
   * @since 1.0
   */
  callback() {
    this.start();
    return this.app.server.callback();
  }


  /**
   * 添加中间件
   *
   * @param {Function|GenerationFunction} middleware - 中间件
   *  中是间是一个`Function`或`GenerationFunction`
   *  如果是Function，则需要返回一个`GenerationFunction`
   *  如果是Funtion，期望的签名是middleware(config, app, papp)
   *   - config: 配置
   *   - app: koa application对象
   *   - papp: plover实例对象
   *
   * @param {Object|Number} options - 配置，如果是Number则相当于 { level: options }
   *   - level   點认为3
   *   - before  用于对中间件进行精确排序
   */
  addMiddleware(middleware, options) {
    assert(typeof middleware === 'function',
        'middleware should be typeof function');

    if (typeof options === 'number') {
      options = { level: options };
    }

    this.middlewares.push({
      middleware: middleware,
      options: options || {}
    });
  }
}


module.exports = Core;


function prepareMiddlewares(app, middlewares) {
  return middlewares.map(item => {
    let mw = item.middleware;
    // 中间件是普通function时，需要初始化
    // 接口形式是middleware(config, koaapp, ploverapp)
    if (!is.generatorFunction(mw)) {
      mw = mw(app.config, app.server, app.proto);
    }

    const name = mw.$name || item.middleware.$name || mw.name;
    const options = item.options;

    const o = {
      name: name,
      module: mw,
      before: options.before,
      after: options.after,
      level: options.level
    };

    return o;
  });
}


function mountMiddlewares(server, items) {
  const sorted = antsort(items, { defaultLevel: 3 });
  for (const item of sorted) {
    logger.info('load middleware: %s, level: %s', item.name, item.level);
    server.use(item.module);
  }
}

