---
title: Advertising
description: Show one accessible sponsor image below the page outline
group: Guide
subgroup: Delivery and operations
order: 43
sidebar: false
---

# Advertising

Canofold provides one image slot below the page outline. It does not include an ad backend, campaign scheduler, or analytics system.

```ts title="canofold.config.ts"
import { defineConfig } from 'canofold'

export default defineConfig({
  advertising: {
    image: '/sponsors/acme.png',
    href: 'https://acme.example',
    alt: 'Acme developer platform',
    label: 'Sponsor'
  }
})
```

`image`, `href`, and `alt` are required; `label` is optional. No empty container is rendered when the option is absent. External links receive `rel="sponsored noopener noreferrer"`. Give the image useful alternative text and protect it with the same private-access policy as HTML, search, AI output, and downloads.
