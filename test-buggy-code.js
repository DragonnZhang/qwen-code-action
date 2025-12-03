/**
 * This file contains several intentional bugs for testing purposes
 */

// Bug 1: 未定义的变量
function calculateTotal(items) {
  let sum = 0;
  for (let i = 0; i <= items.length; i++) {  // 越界访问: 应该是 i < items.length
    sum += items[i].price;
  }
  return sum;
}

// Bug 2: 内存泄漏 - 没有清理事件监听器
class EventManager {
  constructor() {
    this.listeners = [];
  }
  
  addListener(callback) {
    this.listeners.push(callback);
    // 缺少 removeListener 方法
  }
}

// Bug 3: 类型错误
function divideNumbers(a, b) {
  return a / b;  // 没有检查 b 是否为 0
}

// Bug 4: 异步处理错误
async function fetchUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  const data = response.json();  // 忘记 await
  return data;
}

// Bug 5: 字符串拼接 SQL 注入风险
function getUserByName(name) {
  const query = "SELECT * FROM users WHERE name = '" + name + "'";  // SQL 注入风险
  return database.execute(query);
}

// Bug 6: 无限循环风险
function processItems(items) {
  let i = 0;
  while (i < items.length) {
    console.log(items[i]);
    // 忘记递增 i,可能导致无限循环
  }
}

// Bug 7: 变量作用域问题
function createCounters() {
  const counters = [];
  for (var i = 0; i < 5; i++) {  // 应该使用 let 而不是 var
    counters.push(() => console.log(i));
  }
  return counters;
}

// Bug 8: 缺少错误处理
function parseJSON(jsonString) {
  return JSON.parse(jsonString);  // 没有 try-catch
}

// Bug 9: 比较运算符错误
function checkEquality(a, b) {
  if (a == b) {  // 应该使用 === 严格相等
    return true;
  }
  return false;
}

// Bug 10: 未关闭的资源
function readFile(filename) {
  const file = openFile(filename);
  const content = file.read();
  return content;  // 没有关闭文件
}

module.exports = {
  calculateTotal,
  EventManager,
  divideNumbers,
  fetchUserData,
  getUserByName,
  processItems,
  createCounters,
  parseJSON,
  checkEquality,
  readFile
};
