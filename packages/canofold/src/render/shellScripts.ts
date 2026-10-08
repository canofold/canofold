/* v8 ignore next */
export const noFlashScript =
  "try{var t=localStorage.getItem('canofold-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}"
