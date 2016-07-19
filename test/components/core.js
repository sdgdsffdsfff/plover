'use strict';


const co = require('co');
const request = require('supertest');
const sinon = require('sinon');
const antsort = require('antsort');

const plover = require('../../');


/* eslint no-console: 0, max-nested-callbacks: [2, 4] */


describe('components/core', function() {
  const settings = { applicationRoot: 'somepath' };

  describe('应用启动相关', function() {
    it('可以正常启动plover应用', function() {
      const app = plover(settings);
      app.server.should.be.instanceof(require('koa/lib/application'));
      app.start();
    });


    it('启动时需要等待异步流程初始化完毕才提供服务', function(done) {
      const app = plover(settings);
      const workDone = app.readyCallback('longtime service');
      setTimeout(() => {
        app.mywork = 'done!';
        workDone();
      }, 100);

      (app.mywork === undefined).should.be.true();
      app.start(() => {
        app.mywork.should.equal('done!');
        done();
      });
    });


    it('使用listen可以快速启动应用', function() {
      const app = plover(settings);
      return app.listen(1234);
    });
  });


  describe('app.addMiddleware(middleware, [options])', function() {
    it('添加中间件', function() {
      const app = plover(settings);

      app.addMiddleware(function* (next) {
        if (this.url === '/a') {
          this.body = 'hello world a';
        } else {
          yield* next;
        }
      });

      app.addMiddleware(function() {
        return function* (next) {
          if (this.url === '/b') {
            this.body = 'hello world b';
          } else {
            yield* next;
          }
        };
      });

      const agent = request(app.callback());

      return co(function* () {
        yield agent.get('/a').expect('hello world a');
        yield agent.get('/b').expect('hello world b');
      });
    });


    it('设置中间件级别', function() {
      const app = plover(settings);

      app.addMiddleware(function* (next) {
        this.list = [];
        yield* next;
        this.body = this.list.join(' ');
      }, 0);

      app.addMiddleware(function* (next) {
        this.list.push('Hello');
        yield* next;
      }, 2);

      app.addMiddleware(function* (next) {
        this.list.push('Plover');
        yield* next;
      }); // 3 for default

      return request(app.callback())
          .get('/').expect('Hello Plover');
    });


    it('可以使用before精确排序', function() {
      const app = plover(settings);

      app.addMiddleware(function* mycsrf() {
        if (this.ignoreCsrf) {
          this.body = 'ignore csrf';
        } else {
          this.body = 'invalid csrf';
        }
      });

      app.addMiddleware(function* (next) {
        this.ignoreCsrf = true;
        yield* next;
      }, { before: 'mycsrf' });

      return request(app.callback())
          .get('/').expect('ignore csrf');
    });
  });


  describe('app.middleware()', function() {
    it('接入到其他koa应用', function() {
      const papp = plover(settings);

      papp.addMiddleware(function* () {
        this.body = 'hello plover';
      });

      const app = require('koa')();
      app.use(papp.middleware());

      return request(app.callback())
          .get('/').expect('hello plover');
    });
  });


  describe('扩展Plover', function() {
    it('使用$mountMiddlewares覆盖接入中间件的逻辑', function() {
      const callback = sinon.spy();

      class App extends plover.Application {
        $mountMiddlewares(app, items) {
          callback();
          items = antsort(items, { defaultLevel: 3 });
          items.forEach(item => {
            app.use(item.module);
          });
        }
      }

      const app = new App(settings);

      app.addMiddleware(function* Hello() {
        this.body = 'hello';
      });

      app.start();
      callback.called.should.be.true();

      return request(app.callback())
        .get('/hello')
        .expect('hello');
    });
  });


  describe('环境相关', function() {
    it('开发环境时，常会打印在页面上', function() {
      const app = plover(settings);

      app.addMiddleware(function* () {
        if (this.url === '/admin') {
          this.throw(401);
        } else {
          throw new Error('some error happen');
        }
      });

      sinon.stub(console, 'error');

      return co(function* () {
        const agent = request(app.callback());

        // 500及以上 错误异常会打在页面上
        yield agent.get('/')
            .expect(/^<pre>\[Error: some error happen\]\n/);

        // 其他的正常返回到浏览器端
        yield agent.get('/admin').expect(401);

        console.error.restore();
      });
    });
  });
});

