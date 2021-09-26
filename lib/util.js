function loadConfig(configName) {
  return localStorage.getItem(configName) || '';
}

function currentTimeString() {
  let date = new Date();
  return date.getFullYear() + ('0' + (date.getMonth() + 1)).slice(-2) +
    ('0' + date.getDate()).slice(-2) + ('0' + date.getHours()).slice(-2) +
    ('0' + date.getMinutes()).slice(-2) + ('0' + date.getSeconds()).slice(-2);
}

function looseJsonParse(obj){
    return Function('"use strict";return (' + obj + ')')();
}
