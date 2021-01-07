String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t')) {
    return `"${this.replace('"', '""')}"`;
  }
  return this;
}
