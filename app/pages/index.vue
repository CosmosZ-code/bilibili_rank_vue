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
      <div v-if="hasMore" class="load-more" @click="loadMore">
        <span v-if="isLoadingMore">加载中...</span>
        <span v-else>加载更多 ↓</span>
      </div>
      <div v-else-if="!isLoading && displayedVideos.length > 0" class="load-more load-more--end">
        已展示全部 {{ filteredVideos.length }} 条结果
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
import type { VideosDataMap } from '../types'

useHead({
  title: '当前在线 - 嗶哩嗶哩 - ( ゜- ゜)つロ 乾杯~ - bilibili.tv',
  meta: [
    { charset: 'UTF-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
    { name: 'description', content: 'B站实时在线观看人数排行榜' },
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
        // DB 有记录 → 覆盖 Cookie
        purifyPercent.value = prefs.purifyPercent
      } else {
        // DB 无记录 → 把当前 Cookie 值写入 DB
        $fetch('/api/user/preferences', {
          method: 'PUT',
          body: { purifyPercent: purifyPercent.value },
        }).catch(() => {})
      }
    } catch { /* 请求失败静默，保持 Cookie 值 */ }
  }, { immediate: true })

  // 调整滑块 → 1s debounce 写 DB
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

// 非 lazy：SSR 阶段获取缓存时间戳（只读内存缓存，几乎无延迟）
const { data: tsData } = await useAsyncData('ranking-timestamp', () =>
  $fetch('/api/ranking/timestamp'),
)

// 日期格式选项：固定格式确保服务端/客户端渲染一致，避免 hydration mismatch
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

// lazy：主数据不阻塞页面渲染
const { data: videosData, pending: isLoading, error: fetchError } = useFetch<VideosDataMap>(
  '/api/ranking',
  {
    key: 'ranking',
    server: true,
    onResponse({ response }) {
      const ts = response.headers.get('X-Data-Timestamp')
      if (ts) {
        lastDataTimestamp.value = Number(ts)
        updateTime.value = formatDate(Number(ts))
      }
    },
  },
)

const error = computed(() => {
  if (fetchError.value) return (fetchError.value as any)?.message || '加载失败'
  return null
})

const filteredVideos = computed(() => {
  const raw = videosData.value
  if (!raw || typeof raw !== 'object') return []

  let list = Object.entries(raw).map(([bvid, info]) => ({
    bvid,
    title: info.title || '',
    owner: info.owner || '',
    mid: info.mid || '',
    pic: info.pic || '',
    online_count: info.online_count || '0',
    count_num: info.count_num || 0,
    play_count_num: info.play_count_num || 0,
    danmaku_count_num: info.danmaku_count_num || 0,
    play_count: info.play_count || '0',
    danmaku_count: info.danmaku_count || '0',
  }))

  if (sortBy.value === 'count') {
    list.sort((a, b) => b.count_num - a.count_num)
  }

  const term = searchTerm.value.trim().toLowerCase()
  if (term) {
    list = list.filter((v) => v.title.toLowerCase().includes(term) || v.owner.toLowerCase().includes(term))
  }

  if (purifyPercent.value > 0) {
    list = list.filter((v) => {
      if (v.danmaku_count_num > 10000) return true
      return v.danmaku_count_num * 66 >= (v.play_count_num * purifyPercent.value) / 100
    })
  }

  return list
})

// --- 分页加载：只显示 ROWS_PER_LOAD 行，下滑或点击继续加载 ---
const ROWS_PER_LOAD = 5
const gridContainerRef = ref<HTMLElement | null>(null)
const columnsPerRow = ref(5)
const currentRows = ref(ROWS_PER_LOAD)
const isLoadingMore = ref(false)

function updateColumns() {
  const el = gridContainerRef.value
  if (!el) return
  if (window.innerWidth <= 768) {
    columnsPerRow.value = 2
    return
  }
  const minCardWidth = 210
  const gap = 20
  const containerWidth = el.clientWidth
  columnsPerRow.value = Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)))
}

const displayedVideos = computed(() => {
  return filteredVideos.value.slice(0, currentRows.value * columnsPerRow.value)
})

const hasMore = computed(() => {
  return displayedVideos.value.length < filteredVideos.value.length
})

function loadMore() {
  if (!hasMore.value || isLoadingMore.value) return
  isLoadingMore.value = true
  setTimeout(() => {
    currentRows.value += ROWS_PER_LOAD
    isLoadingMore.value = false
  }, 200)
}

// 筛选条件变化时重置展示行数
watch([searchTerm, purifyPercent, sortBy], () => {
  currentRows.value = ROWS_PER_LOAD
})

// 数据刷新时重置展示行数
watch(videosData, () => {
  currentRows.value = ROWS_PER_LOAD
})

// 滚轮/触摸：到达底部后继续下拉才加载更多
function onWheel(e: WheelEvent) {
  if (e.deltaY <= 0) return
  if (!hasMore.value || isLoadingMore.value) return
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
  if (!hasMore.value || isLoadingMore.value) return
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5
  if (atBottom) {
    loadMore()
  }
}

onMounted(() => {
  updateColumns()
  window.addEventListener('resize', updateColumns)
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateColumns)
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
})

// 客户端：已登录用户动态追加个性化热门视频
if (import.meta.client) {
  watch(videosData, async () => {
    try {
      const extra = await $fetch<Record<string, any>>('/api/ranking/personalized')
      if (extra && Object.keys(extra).length > 0 && videosData.value) {
        Object.assign(videosData.value, extra)
      }
    } catch {
      // 静默失败，全局数据已展示
    }
  }, { immediate: true })
}

const { showButton: showBackToTop, scrollToTop } = useScrollToTop(300)

function onBackToTop() {
  scrollToTop(async () => {
    currentRows.value = ROWS_PER_LOAD
    // 检查数据是否已更新，时间戳相同则跳过刷新
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
