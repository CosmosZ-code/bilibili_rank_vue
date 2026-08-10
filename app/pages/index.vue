<template>
  <div>
    <ClientOnly>
      <BannerContainer :initial-banners="bannerData" />
      <template #fallback>
        <div style="min-height: 155px; height: 10vw; max-height: 240px; background: var(--b-blue);"></div>
      </template>
    </ClientOnly>

    <div class="container">
      <RankingControls
        :viewMode="viewMode"
        :searchTerm="activeSearchTerm"
        :purifyPercent="purifyPercent"
        :areaId="areaId"
        :areas="areas"
        @update:viewMode="onViewModeChange"
        @update:searchTerm="onSearchTermChange"
        @update:purifyPercent="purifyPercent = $event"
        @update:areaId="areaId = $event"
      />

      <div ref="gridContainerRef">
        <!-- 视频模式 -->
        <template v-if="viewMode === 'videos'">
          <VideoGrid
            :videos="displayedVideos"
            :isLoading="effectiveVideoLoading"
            :error="error"
          />

          <!-- 加载更多 -->
          <div v-if="vlHasMore" class="load-more" @click="loadMore">
            <span v-if="isLoadingMore">加载中...</span>
            <span v-else>下滑加载更多...</span>
          </div>
          <div v-else-if="!effectiveVideoLoading && displayedVideos.length > 0" class="load-more load-more--end">
            已展示全部 {{ displayedVideos.length }} 条结果
          </div>
        </template>

        <!-- 直播模式 -->
        <template v-else>
          <LiveGrid
            :rooms="displayedLiveRooms"
            :isLoading="effectiveLiveLoading"
            :error="liveError"
          />

          <!-- 加载更多 -->
          <div v-if="liveHasMoreFromServer" class="load-more" @click="loadMoreLive">
            <span v-if="liveIsLoadingMore">加载中...</span>
            <span v-else>加载更多...</span>
          </div>
          <div v-else-if="!effectiveLiveLoading && displayedLiveRooms.length > 0" class="load-more load-more--end">
            已展示全部 {{ displayedLiveRooms.length }} 条结果
          </div>
        </template>
      </div>

      <!-- 页脚 -->
      <div class="update-time">
        数据最后<span>更新时间: {{ updateTime }}</span>
        <p class="subtitle">此页面基于以下开源项目：</p>
        <p class="github-link">
          <a href="https://github.com/CosmosZ-code/bilibili_rank_vue" target="_blank">
            <svg height="24" width="24" viewBox="0 0 16 16" style="vertical-align: middle;">
              <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>&nbsp;<b>bilibili_rank_vue</b>
          </a>
        </p>
      </div>
    </div>

    <BackToTop :show="showBackToTop" @click="onBackToTop" />

    <!-- Toast 通知 -->
    <ClientOnly>
      <Toast />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { LiveRankingResponse, LiveArea, ViewMode, BannerDataSet } from '../types'
import { shouldSkipRefresh } from '../utils/cache'
import { formatDate, DATE_LOCALE_OPTIONS } from '../utils/date'

useHead({
  title: '当前在线 - 嗶哩嗶哩 - ( ゜- ゜)つロ 乾杯~ - bilibili.tv',
  meta: [
    { charset: 'UTF-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
    { name: 'description', content: 'B站实时在线观看人数排行榜' },
    { name: 'referrer', content: 'no-referrer' },
  ],
})

// Banner 数据 SSR 预取（banner-warmer 已预热缓存，内存读取 <1ms）
const { data: bannerData } = useFetch<BannerDataSet[]>('/api/banners', { default: () => [] })

// ============================================================
// 视图模式：从 URL query 读取
// ============================================================
const route = useRoute()
const router = useRouter()
const viewMode = ref<ViewMode>('videos')

// 初始化 viewMode
if (route.query.view === 'live') {
  viewMode.value = 'live'
}

function onViewModeChange(newMode: ViewMode) {
  viewMode.value = newMode
  router.push({ query: { ...route.query, view: newMode === 'live' ? 'live' : undefined } })
}

// ============================================================
// 视频排行的搜索词 = 直播排行的搜索词共用一个？
// 为了隔离，使用各自独立的搜索词
// ============================================================
const videoSearchTerm = ref('')
const liveSearchTerm = ref('')

// RankingControls 绑定的搜索词：根据当前 viewMode 路由
const activeSearchTerm = computed(() =>
  viewMode.value === 'videos' ? videoSearchTerm.value : liveSearchTerm.value,
)

function onSearchTermChange(val: string) {
  if (viewMode.value === 'videos') {
    videoSearchTerm.value = val
  } else {
    liveSearchTerm.value = val
  }
}

// ============================================================
// 视频模式
// ============================================================
const sortBy = ref<'count'>('count')
const purifyPercent = useCookie<number>('purify_percent', { default: () => 10 })

// 登录后从 DB 同步偏好
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

const updateTime = ref(
  tsData.value?.timestamp
    ? formatDate(tsData.value.timestamp)
    : '加载中...',
)
const lastLiveTimestamp = ref(0)
const lastAreaTimestamps = ref<Record<number, number>>({})

// --- 视频分页 ---
const PAGE_SIZE = 30
const isLoadingMore = ref(false)

function buildQuery(page: number) {
  return {
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortBy.value,
    search: videoSearchTerm.value || undefined,
    purifyPercent: purifyPercent.value,
  }
}

// 视频列表管理器（替代 useLazyAsyncData）
const {
  displayedVideos: vlDisplayedVideos,
  initialLoading: vlInitialLoading,
  initialError: vlInitialError,
  hasMore: vlHasMore,
  totalCount: vlTotalCount,
  timestamp: vlTimestamp,
  loadInitial,
  refreshFilter,
  forceRefresh,
  loadMore: vlLoadMore,
  refreshPersonalized,
} = useVideoList()

// 登录成功（未登录 → 已登录）→ 立即拉取个性化数据
if (import.meta.client) {
  const { user: authUser } = useAuth()
  watch(authUser, (u, prev) => {
    if (u?.bilibiliUid && !prev?.bilibiliUid && !vlInitialLoading.value) {
      refreshPersonalized()
    }
  })
}

// 视频数据时间戳变化 → 更新页脚更新时间
watch(vlTimestamp, (ts) => {
  if (ts) updateTime.value = formatDate(ts)
})

// 首次加载（客户端执行，SSR 时显示骨架屏）
if (import.meta.client) {
  loadInitial(() => buildQuery(1))
}

// 过滤变化 → 无闪烁刷新（300ms 防抖内置于 refreshFilter）
watch([videoSearchTerm, purifyPercent], () => {
  refreshFilter(() => buildQuery(1))
})

// 数据为空时自动重试（cache warmer 尚未完成首次预热）
function startEmptyRetry(checkPending: () => boolean, refresh: () => void) {
  let delay = 2000
  function schedule() {
    if (!checkPending()) return // 数据已到，停止
    setTimeout(() => {
      refresh()
      delay = Math.min(delay * 2, 15000) // 退避：2s→4s→8s→15s
      schedule()
    }, delay)
  }
  schedule()
}

if (import.meta.client) {
  const videoPending = computed(() =>
    !vlInitialLoading.value && vlTotalCount.value === 0 && !videoSearchTerm.value,
  )
  watch(videoPending, (pending) => {
    if (pending) startEmptyRetry(() => videoPending.value, () => forceRefresh(() => buildQuery(1)))
  })
}

// SSR 阶段 + 首次加载 → 骨架屏
const effectiveVideoLoading = computed(() =>
  vlInitialLoading.value || import.meta.server,
)

const displayedVideos = computed(() => vlDisplayedVideos.value)

const error = computed(() => vlInitialError.value)

// 加载更多（代理到 videoList）
async function loadMore() {
  if (isLoadingMore.value || !vlHasMore.value) return
  isLoadingMore.value = true
  const nextPage = Math.floor((vlDisplayedVideos.value || []).length / PAGE_SIZE) + 1
  try {
    await vlLoadMore(() => buildQuery(nextPage))
  } finally {
    isLoadingMore.value = false
  }
}

// ============================================================
// 直播模式
// ============================================================
const areaId = ref(0)
const liveCurrentPage = ref(1)
const liveIsLoadingMore = ref(false)
const liveExtraItems = ref<(import('../types').LiveRoomInfo)[]>([])

const areas = ref<LiveArea[]>([])

// 加载分区列表（页面初始化即加载，保证 dropdown hover 时已有数据）
let areasLoaded = false
async function loadAreas() {
  if (areasLoaded) return
  try {
    const res = await $fetch<{ areas: LiveArea[] }>('/api/live-areas')
    if (res.areas?.length) {
      areas.value = res.areas
      areasLoaded = true
    }
  } catch { /* 静默 */ }
}

// 客户端 & SSR 后都尝试加载（SSR 阶段 $fetch 服务端地址）
if (import.meta.client) {
  loadAreas()
}

function buildLiveQuery(page: number) {
  return {
    page,
    pageSize: PAGE_SIZE,
    search: liveSearchTerm.value || undefined,
    areaId: areaId.value > 0 ? areaId.value : undefined,
  }
}

// 直播首页数据（延迟加载：仅客户端 + 直播模式才获取）
const liveDataEnabled = ref(import.meta.client && viewMode.value === 'live')
const areaDataCache = ref<Record<number, LiveRankingResponse>>({}) // 各分区原始数据缓存（无搜索词）

const { data: livePage1Data, pending: liveIsLoading, error: liveFetchError } = useLazyAsyncData(
  'live-ranking',
  () => {
    if (!liveDataEnabled.value) return undefined as any
    return $fetch<LiveRankingResponse>('/api/live-rooms', { query: buildLiveQuery(1) })
  },
  { watch: [liveSearchTerm], server: false },
)

// SSR 阶段强制 loading 状态以显示骨架屏
const liveLoading = computed(() => liveIsLoading.value || import.meta.server)

// 数据预热中（缓存为空 + 无搜索词 → 应显示骨架屏而非"无结果"）
const liveDataPending = computed(() =>
  !import.meta.server && !liveIsLoading.value &&
  livePage1Data.value?.total === 0 && !liveSearchTerm.value,
)

const effectiveLiveLoading = computed(() => liveLoading.value || liveDataPending.value)

const displayedLiveRooms = computed(() => {
  const page1 = livePage1Data.value?.items || []
  return [...page1, ...liveExtraItems.value]
})

const liveHasMoreFromServer = ref(true)

watch(livePage1Data, (data) => {
  if (!data) return
  liveExtraItems.value = []
  liveCurrentPage.value = 1
  liveHasMoreFromServer.value = data.hasMore
  if (data.timestamp) {
    lastLiveTimestamp.value = data.timestamp
    lastAreaTimestamps.value = { ...lastAreaTimestamps.value, [areaId.value]: data.timestamp }
    updateTime.value = formatDate(data.timestamp)
    // 仅无搜索词时缓存（搜索结果是临时的，不适合跨分区复用）
    if (!liveSearchTerm.value) {
      areaDataCache.value = { ...areaDataCache.value, [areaId.value]: data }
    }
  }
})

async function loadMoreLive() {
  if (!liveHasMoreFromServer.value || liveIsLoadingMore.value) return
  liveIsLoadingMore.value = true
  const nextPage = liveCurrentPage.value + 1
  try {
    const res = await $fetch<LiveRankingResponse>('/api/live-rooms', { query: buildLiveQuery(nextPage) })
    liveExtraItems.value.push(...res.items)
    liveHasMoreFromServer.value = res.hasMore
    liveCurrentPage.value = nextPage
  } catch {
    // 加载失败静默
  } finally {
    liveIsLoadingMore.value = false
  }
}

const liveError = computed(() => {
  if (liveFetchError.value) return (liveFetchError.value as any)?.message || '加载失败'
  return null
})

// ============================================================
// 刷新函数（供视图切换 + 回顶共用）
// ============================================================
async function refreshVideoData() {
  forceRefresh(() => buildQuery(1))
}

async function refreshLiveData() {
  // 有本地缓存且无搜索词 → 检查时间戳决定是否可复用
  const cached = areaDataCache.value[areaId.value]
  if (cached && !liveSearchTerm.value) {
    try {
      const { timestamp } = await $fetch('/api/live-rooms/timestamp', {
        query: { areaId: areaId.value > 0 ? areaId.value : undefined },
      })
      const localTs = areaId.value > 0 ? lastAreaTimestamps.value[areaId.value] : lastLiveTimestamp.value
      if (shouldSkipRefresh(timestamp, localTs)) {
        // 数据未变化 → 从本地缓存恢复（零网络请求）
        livePage1Data.value = cached as any
        liveHasMoreFromServer.value = cached.hasMore
        return
      }
    } catch { /* 失败则照常刷新 */ }
  }
  refreshNuxtData('live-ranking')
}

// 用于防止 viewMode + areaId 同步变化时的双重刷新
let liveRefreshVersion = 0

// 切换视图时：重置分页 + 按需刷新数据
watch(viewMode, async (mode) => {
  if (mode === 'live') {
    // 首次切换到直播：启用数据加载（仅作门卫，不再触发自动拉取）
    liveDataEnabled.value = true
    // 重置直播分页
    liveExtraItems.value = []
    liveCurrentPage.value = 1
    liveHasMoreFromServer.value = true

    const myVersion = ++liveRefreshVersion
    await nextTick() // 等待同一事件周期内 areaId 的可能变化

    // 若 areaId watcher 已抢占（版本号被递增），则跳过
    if (myVersion !== liveRefreshVersion) return
    await refreshLiveData()
  } else {
    // 重置视频数据（即时刷新，不防抖）
    await refreshVideoData()
  }
})

// 直播分区切换：重置分页 + 按需刷新
watch(areaId, async (newAreaId, oldAreaId) => {
  if (!liveDataEnabled.value) return
  if (newAreaId === oldAreaId) return // 初始化或值未变

  liveExtraItems.value = []
  liveCurrentPage.value = 1
  liveHasMoreFromServer.value = true

  ++liveRefreshVersion // 取消 viewMode watcher 中的待定刷新
  await refreshLiveData()
})

// ============================================================
// 数据为空时自动重试（cache warmer 尚未完成首次预热 — 仅直播模式）
// 注：视频模式的空数据重试已在 videoList 初始化块中处理
// ============================================================
watch(liveDataPending, (pending) => {
  if (pending) {
    let delay = 2000
    function schedule() {
      if (!liveDataPending.value) return
      setTimeout(() => {
        refreshNuxtData('live-ranking')
        delay = Math.min(delay * 2, 15000)
        schedule()
      }, delay)
    }
    schedule()
  }
})

// ============================================================
// 滚轮/触摸：到达底部后继续下拉才加载更多
// ============================================================
function onWheel(e: WheelEvent) {
  if (e.deltaY <= 0) return
  if (viewMode.value === 'videos') {
    if (!vlHasMore.value || isLoadingMore.value) return
  } else {
    if (!liveHasMoreFromServer.value || liveIsLoadingMore.value) return
  }
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5
  if (atBottom) {
    if (viewMode.value === 'videos') {
      loadMore()
    } else {
      loadMoreLive()
    }
  }
}

let lastTouchY = 0

function onTouchStart(e: TouchEvent) {
  lastTouchY = e.touches[0].clientY
}

function onTouchMove(e: TouchEvent) {
  const currentY = e.touches[0].clientY
  const deltaY = lastTouchY - currentY
  lastTouchY = currentY
  if (deltaY <= 0) return
  if (viewMode.value === 'videos') {
    if (!vlHasMore.value || isLoadingMore.value) return
  } else {
    if (!liveHasMoreFromServer.value || liveIsLoadingMore.value) return
  }
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5
  if (atBottom) {
    if (viewMode.value === 'videos') {
      loadMore()
    } else {
      loadMoreLive()
    }
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
    if (viewMode.value === 'videos') {
      await refreshVideoData()
    } else {
      liveExtraItems.value = []
      liveCurrentPage.value = 1
      liveHasMoreFromServer.value = livePage1Data.value?.hasMore ?? true
      await refreshLiveData()
    }
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
