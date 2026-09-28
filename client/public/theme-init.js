// Runs before React to apply the saved/OS theme and avoid a flash of the wrong theme.
;(function () {
  var theme = null
  try { theme = localStorage.getItem('pravi-theme') } catch (e) {}
  if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  if (theme === 'dark') document.documentElement.classList.add('dark')
})()
