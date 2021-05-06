String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t')) {
    return `"${this.replace('"', '""')}"`;
  }
  return this;
}

function loadConfig(configName) {
  return localStorage.getItem(configName) || '';
}
