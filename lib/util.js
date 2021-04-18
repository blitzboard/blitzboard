String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t')) {
    return `"${this.replace('"', '""')}"`;
  }
  return this;
}

function loadConfig(configName) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(configName) || localStorage.getItem(configName) || '';
}