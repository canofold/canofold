export function packageFunction(module, name) {
  const value = module[name] ?? module.default?.[name]
  if (typeof value !== 'function') {
    throw new TypeError(`Package module does not export a ${name} function`)
  }
  return value
}
