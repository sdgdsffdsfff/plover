'use strict';


const is = require('is-type-of');


const logger = require('plover-logger')('plover:util/invoker');



/**
 * 用于遍历调用拦截器方法
 *
 * @param {Array}   list    - 挡截器列表
 * @param {String}  method  - 方法名
 * @param {Object}  context - 上下文
 * @param {Boolean} reverse - 是否逆序调用
 * @return {NavigateResult} - 结果
 */
/* eslint complexity: [2, 8] */
exports.filter = function* filter(list, method, context, reverse) {
  for (let i = 0, c = list.length; i < c; i++) {
    const index = reverse ? c - i - 1 : i;
    const item = list[index];
    const fn = item.filter[method];
    if (fn) {
      const name = item.name || item.filter.name || '';
      logger.debug('%s.%s', name, method);
      const result = is.generatorFunction(fn) ?
        yield* fn.call(context) : fn.call(context);

      if (exports.isSuccess(result)) {
        return result;
      }
    }
  }
  return null;
};


/**
 * 判断controller或filter的结果是否ok了
 * 如果ok了，就表示得到了想要的结果需要break了
 *
 * @param {NavigateResult} result - 结果
 * @return {Boolean}              - 是否结束
 */
exports.isSuccess = function(result) {
  // 快速测试，大多数是这种情况
  if (result === undefined || result === null) {
    return false;
  }

  return result === false || typeof result === 'object';
};

