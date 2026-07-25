<template>
  <div>
    <ClientOnly>
      <BannerContainer />
      <template #fallback>
        <div style="min-height: 155px; height: 10vw; max-height: 240px; background: var(--b-blue);"></div>
      </template>
    </ClientOnly>

    <div class="container">
      <RankingControls
        :sortBy="sortBy"
        :searchTerm="searchTerm"
        :purifyPercent="purifyPercent"
        @update:sortBy="sortBy = $event"
        @update:searchTerm="searchTerm = $event"
        @update:purifyPercent="purifyPercent = $event"
      />

      <div ref="gridContainerRef">
        <VideoGrid
          :videos="displayedVideos"
          :isLoading="isLoading"
          :error="error"
        />
      </div>

      <!-- 加载更多：滚动到底自动触发 / 点击手动加载 -->
      <div v-if="hasMoreFromServer" class="load-more" @click="loadMore">
        <span v-if="isLoadingMore">加载中...</span>
        <span v-else>加载更多 ↓</span>
      </div>
      <div v-else-if="!isLoading && displayedVideos.length > 0" class="load-more load-more--end">
        已展示全部 {{ displayedVideos.length }} 条结果
      </div>

      <!-- 页脚 — 对应原 update-time -->
      <div class="update-time">
        数据最后<span>更新时间: {{ updateTime }}</span>
        <p class="subtitle">此页面基于以下开源项目：</p>
        <p class="github-link">
          <a href="https://github.com/CosmosZ-code/bilibili_rank_html" target="_blank">
            <svg height="24" width="24" viewBox="0 0 16 16" style="vertical-align: middle;">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <b>bilibili_rank_html</b>
          </a>
        </p>
      </div>
    </div>

    <BackToTop :show="showBackToTop" @click="onBackToTop" />
  </div>
</template>

<script setup lang="ts">
import type { RankingResponse, VideoWithBvid } from '../types'

useHead({
  title: '当前在线 - 嗶哩嗶哩 - ( ゜- ゜)つロ 乾杯~ - bilibili.tv',
  meta: [
    { charset: 'UTF-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
    { name: 'description', content: 'B站实时在线观看人数排行榜' },
    { name: 'referrer', content: 'no-referrer' },
  ],
})

const sortBy = ref<'count'>('count')
const searchTerm = ref('')
const purifyPercent = useCookie<number>('purify_percent', { default: () => 10 })

// 登录后从 DB 同步偏好（DB > Cookie），首次登录把 Cookie 值写 DB
if (import.meta.client) {
  const { user: authUser } = useAuth()
  watch(authUser, async (u) => {
    if (!u?.bilibiliUid) return
    try {
      const prefs = await $fetch<{ purifyPercent: number | null }>('/api/user/preferences')
      if (prefs.purifyPercent !== null) {
        purifyPercent.value = prefs.purifyPercent
      } else {
        $fetch('/api/user/preferences', {
          method: 'PUT',
          body: { purifyPercent: purifyPercent.value },
        }).catch(() => {})
      }
    } catch { /* 请求失败静默 */ }
  }, { immediate: true })

  let saveTimer: ReturnType<typeof setTimeout>
  watch(purifyPercent, (val) => {
    if (!authUser.value?.bilibiliUid) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      $fetch('/api/user/preferences', {
        method: 'PUT',
        body: { purifyPercent: val },
      }).catch(() => {})
    }, 1000)
  })
}

// 非 lazy：SSR 阶段获取缓存时间戳
const { data: tsData } = await useAsyncData('ranking-timestamp', () =>
  $fetch('/api/ranking/timestamp'),
)

const DATE_LOCALE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
}

function formatDate(ts: number | Date): string {
  return new Date(ts).toLocaleString('zh-CN', DATE_LOCALE_OPTIONS)
}

const updateTime = ref(
  tsData.value?.timestamp
    ? formatDate(tsData.value.timestamp)
    : '加载中...',
)
const lastDataTimestamp = ref(tsData.value?.timestamp ?? 0)

// --- 分页加载 ---
const PAGE_SIZE = 30
const currentPage = ref(1)
const isLoadingMore = ref(false)
const extraItems = ref<VideoWithBvid[]>([])  // 第 2 页及以后的数据

// 构建查询参数
function buildQuery(page: number) {
  return {
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortBy.value,
    search: searchTerm.value || undefined,
    purifyPercent: purifyPercent.value,
  }
}

// 首页数据（SSR + 响应式 refetch）
const { data: page1Data, pending: isLoading, error: fetchError } = useLazyAsyncData(
  'ranking',
  () => $fetch<RankingResponse>('/api/ranking', { query: buildQuery(1) }),
  { watch: [searchTerm, purifyPercent, sortBy] },
)

// 合并首页 + 额外加载的页面 → 直接派生，无需 watch 拷贝（避免 SSR hydration mismatch）
const displayedVideos = computed(() => {
  const page1 = page1Data.value?.items || []
  return [...page1, ...extraItems.value]
})

// 是否还有更多数据
const hasMoreFromServer = ref(true)

// 首页数据变化时重置（筛选/排序变化触发 refetch）
watch(page1Data, (data) => {
  if (!data) return
  extraItems.value = []
  currentPage.value = 1
  hasMoreFromServer.value = data.hasMore
  if (data.timestamp) {
    lastDataTimestamp.value = data.timestamp
    updateTime.value = formatDate(data.timestamp)
  }
})

// 加载更多（客户端 only）
async function loadMore() {
  if (!hasMoreFromServer.value || isLoadingMore.value) return
  isLoadingMore.value = true
  const nextPage = currentPage.value + 1
  try {
    const res = await $fetch<RankingResponse>('/api/ranking', { query: buildQuery(nextPage) })
    extraItems.value.push(...res.items)
    hasMoreFromServer.value = res.hasMore
    currentPage.value = nextPage
  } catch {
    // 加载失败静默，用户可以重试
  } finally {
    isLoadingMore.value = false
  }
}

const error = computed(() => {
  if (fetchError.value) return (fetchError.value as any)?.message || '加载失败'
  return null
})

// --- 滚轮/触摸：到达底部后继续下拉才加载更多 ---
function onWheel(e: WheelEvent) {
  if (e.deltaY <= 0) return
  if (!hasMoreFromServer.value || isLoadingMore.value) return
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5
  if (atBottom) {
    loadMore()
  }
}

let lastTouchY = 0

function onTouchStart(e: TouchEvent) {
  lastTouchY = e.touches[0].clientY
}

function onTouchMove(e: TouchEvent) {
  const currentY = e.touches[0].clientY
  const deltaY = lastTouchY - currentY  // >0 = 手指上滑（页面向下滚动）
  lastTouchY = currentY
  if (deltaY <= 0) return
  if (!hasMoreFromServer.value || isLoadingMore.value) return
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5
  if (atBottom) {
    loadMore()
  }
}

onMounted(() => {
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
})

const { showButton: showBackToTop, scrollToTop } = useScrollToTop(300)

function onBackToTop() {
  scrollToTop(async () => {
    // 回缩：清除额外加载的页面，回到首页
    extraItems.value = []
    currentPage.value = 1
    hasMoreFromServer.value = page1Data.value?.hasMore ?? true
    // 数据已过期则刷新
    try {
      const { timestamp } = await $fetch('/api/ranking/timestamp')
      if (timestamp && lastDataTimestamp.value && timestamp === lastDataTimestamp.value) {
        return
      }
    } catch { /* 失败则照常刷新 */ }
    refreshNuxtData('ranking')
  })
}
</script>

<style scoped>
.update-time {
  text-align: center;
  margin-top: 20px;
  color: #99a2aa;
  font-size: 14px;
}

.subtitle {
  margin-top: 20px;
  font-size: 14px;
  color: #222222;
  font-weight: bold;
  opacity: 0.8;
}

.github-link {
  margin-top: 10px;
}

.github-link a {
  color: black;
  text-decoration: none;
  opacity: 0.8;
}

.github-link a:hover {
  opacity: 1;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 20px;
  margin-top: 10px;
  color: #99a2aa;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

.load-more:hover {
  color: var(--b-pink);
}

.load-more--end {
  cursor: default;
  color: #ccc;
}

.load-more--end:hover {
  color: #ccc;
}
</style>
