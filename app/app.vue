<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
// 主题：
// - SSR：useServerHead 输出 cookie 解析结果到 <html data-theme>（仅服务端，客户端不应用）
// - 客户端：watch 手动同步 data-theme（绕开 unhead 对 computed htmlAttrs 的 SSR 序列化问题）
// - 首帧：内联脚本（head 内，body 渲染前）读 cookie + 系统偏好修正 data-theme，无闪烁
const { resolvedTheme } = useTheme()

useServerHead({
  htmlAttrs: { 'data-theme': resolvedTheme.value },
})

if (import.meta.client) {
  watch(resolvedTheme, (v) => {
    document.documentElement.dataset.theme = v
  }, { immediate: true })
}

// 首帧内联脚本（head 内，body 渲染前执行）：
// 读取 theme_mode cookie 修正 data-theme，消除 auto 模式下的首帧闪白
const THEME_INIT_SCRIPT = `;(function(){var mode='auto';try{var m=document.cookie.match(/(?:^|;\\s*)theme_mode=([^;]*)/);if(m)mode=decodeURIComponent(m[1])}catch(e){}if(mode!=='light'&&mode!=='dark'&&mode!=='auto')mode='auto';var dark=mode==='dark'||(mode==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light')})()`

useHead({
  script: [{ innerHTML: THEME_INIT_SCRIPT }],
})
</script>
