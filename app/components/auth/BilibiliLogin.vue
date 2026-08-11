<template>
  <div class="bilibili-login">
    <!-- 未登录 -->
    <button v-if="!isLoggedIn" class="login-btn" @click="startLogin">
      B站登录
    </button>

    <!-- 已登录 -->
    <div
      v-else
      ref="userMenuWrapperRef"
      class="user-info"
      @mouseenter="onUserEnter"
      @mouseleave="onUserLeave"
      @click="onUserClick"
    >
      <img
        v-if="user?.bilibiliFace"
        :src="user.bilibiliFace"
        :alt="user.bilibiliUname"
        class="avatar"
        referrerpolicy="no-referrer"
      />
      <span class="username">{{ user?.bilibiliUname }}</span>
      <div v-if="isMenuOpen" ref="userDropdownRef" class="dropdown-menu" @mouseenter="onMenuEnter" @mouseleave="onUserLeave">
        <button class="logout-btn" @click="doLogout">退出登录</button>
      </div>
    </div>

    <!-- 二维码登录弹窗 -->
    <Teleport to="body">
      <div v-if="showQr" class="qr-overlay" @click.self="closeQr">
        <div class="qr-modal">
          <h3>B站扫码登录</h3>

          <!-- 加载中 -->
          <div v-if="qrStatus === 'loading'" class="qr-loading">
            正在获取二维码...
          </div>

          <!-- 二维码展示 -->
          <div v-else-if="qrStatus === 'pending' || qrStatus === 'scanned'" class="qr-wrap">
            <canvas ref="qrCanvasRef" class="qr-canvas"></canvas>

            <!-- 桌面端：扫码提示 -->
            <template v-if="!isTouch">
              <p class="qr-tip">
                {{ qrStatus === 'scanned' ? '✓ 已扫码，请在手机上确认' : '请使用 B站客户端 扫码登录' }}
              </p>
            </template>

            <!-- 触屏端：App 确认引导（手机无法自扫，引导唤起 App / 截图扫码） -->
            <template v-else>
              <a
                v-if="qrStatus === 'pending'"
                class="app-confirm-btn"
                :href="qrUrl"
                target="_blank"
                rel="noopener"
              >在 B站 App 中确认登录</a>
              <p class="qr-tip">
                {{ qrStatus === 'scanned' ? '✓ 已扫码，请在 App 中确认' : '未自动打开 App？' }}
              </p>
              <p v-if="qrStatus === 'pending'" class="qr-tip app-fallback-tip">
                截图保存上方二维码 → 打开 B站 App →<br>扫一扫 → 右上角相册选图
              </p>
            </template>
          </div>

          <!-- 过期 -->
          <div v-else-if="qrStatus === 'expired'" class="qr-expired">
            <p>二维码已失效</p>
            <button class="retry-btn" @click="startLogin">重新获取</button>
          </div>

          <!-- 成功 -->
          <div v-else-if="qrStatus === 'success'" class="qr-success">
            <p>✓ 登录成功！</p>
          </div>

          <!-- 错误 -->
          <div v-else-if="qrStatus === 'error'" class="qr-error">
            <p>获取二维码失败，请重试</p>
            <button class="retry-btn" @click="startLogin">重试</button>
          </div>

          <button class="close-btn" @click="closeQr">关闭</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'

const { user, isLoggedIn, fetchUser, logout, loading } = useAuth()
const { isTouch } = useTouchDevice()

const showQr = ref(false)
const qrStatus = ref<'loading' | 'pending' | 'scanned' | 'expired' | 'success' | 'error'>('loading')
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const isMenuOpen = ref(false)
const userMenuWrapperRef = ref<HTMLElement | null>(null)
const userDropdownRef = ref<HTMLElement | null>(null)
let menuCloseTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function onUserEnter() {
  if (isTouch.value) return
  clearMenuTimer()
  isMenuOpen.value = true
}
function onMenuEnter() {
  if (isTouch.value) return
  clearMenuTimer()
}
function onUserLeave() {
  if (isTouch.value) return
  menuCloseTimer = setTimeout(() => {
    isMenuOpen.value = false
  }, 200)
}
function clearMenuTimer() {
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer)
    menuCloseTimer = null
  }
}

/** 触屏设备：点按用户区域切换下拉菜单 */
function onUserClick() {
  if (!isTouch.value) return
  isMenuOpen.value = !isMenuOpen.value
}

/** 触屏设备：点击下拉外部时关闭 */
function onDocumentClick(e: MouseEvent) {
  if (!isTouch.value || !isMenuOpen.value) return
  if (isClickOutside(e.target as Node, [userMenuWrapperRef.value, userDropdownRef.value])) {
    isMenuOpen.value = false
  }
}

// 移动端顶栏场景：页面滚动时关闭用户菜单（顶栏收回后菜单不残留）。
// 桌面 BannerNav 中的登录菜单为 hover 控制 + 非 fixed 定位，无此问题
let onScrollClose: (() => void) | null = null

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (window.matchMedia('(max-width: 768px)').matches) {
    onScrollClose = () => {
      isMenuOpen.value = false
    }
    window.addEventListener('scroll', onScrollClose, { passive: true })
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (onScrollClose) {
    window.removeEventListener('scroll', onScrollClose)
  }
})
let qrcodeKey = ''
let qrCookies = ''
/** 二维码内容 URL（B站 App 内确认登录页地址，触屏端用于唤起 App） */
let qrUrl = ''
/** 轮询连续失败计数（网络瞬时错误不立即中止流程） */
let pollFailCount = 0

/** 生成二维码到 canvas */
async function renderQr(url: string) {
  await nextTick()
  const canvas = qrCanvasRef.value
  if (!canvas) return
  await QRCode.toCanvas(canvas, url, { width: 200, margin: 1 })
}

/**
 * 轮询扫码状态
 *
 * 并发请求可能乱序到达（尤其高延迟的海外服务器），采用优先级策略：
 * - success 拥有最高优先级，无论当前状态如何都可覆盖
 * - expired / error 为终态，一旦处于这些状态则忽略其他非 success 响应
 */
async function pollStatus() {
  if (!qrcodeKey) return

  try {
    const data = await $fetch<{
      status: string
      message?: string
    }>('/api/auth/qr-check', { params: { qrcode_key: qrcodeKey, cookies: qrCookies } })

    // 收到服务端响应即视为轮询正常，重置失败计数
    pollFailCount = 0

    // success 最高优先级：可以覆盖任何状态（包括已显示 expired/error）
    if (data.status === 'success') {
      qrStatus.value = 'success'
      stopPolling()
      setTimeout(async () => {
        showQr.value = false
        // 等待可能的并发 fetchUser（loading 锁）完成，避免锁内直接 return
        for (let i = 0; i < 10 && loading.value; i++) {
          await new Promise((r) => setTimeout(r, 200))
        }
        // session 已建立，fetchUser 偶发失败时重试（最多 3 次），
        // 避免登录成功但界面仍显示未登录
        for (let attempt = 0; attempt < 3; attempt++) {
          await fetchUser()
          if (isLoggedIn.value) break
          await new Promise((r) => setTimeout(r, 1000))
        }
      }, 800)
      return
    }

    // 已处于终态（success / expired / error），忽略其他非 success 响应
    if (qrStatus.value === 'success' || qrStatus.value === 'expired' || qrStatus.value === 'error') {
      return
    }

    // 正常状态流转
    switch (data.status) {
      case 'pending':
        break
      case 'scanned':
        qrStatus.value = 'scanned'
        break
      case 'expired':
        qrStatus.value = 'expired'
        stopPolling()
        break
    }
  } catch {
    // success 优先：如果已有 success 则忽略网络错误
    if (qrStatus.value === 'success') return
    // 网络瞬时错误不立即中止：App 确认期间页面可能被切到后台，
    // 定时器被浏览器冻结/请求超时，切回页面后由 visibilitychange 立即重试。
    // 仅连续失败多次才进入错误态。
    pollFailCount++
    if (pollFailCount >= 3) {
      qrStatus.value = 'error'
      stopPolling()
    }
  }
}

/**
 * 页面从后台切回时立即轮询一次
 *
 * App 确认登录期间网页 tab 处于后台，浏览器会冻结定时器导致轮询暂停；
 * 切回页面时立即检查一次，避免错过登录成功状态。
 */
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  if (!showQr.value) return
  if (qrStatus.value === 'success' || qrStatus.value === 'expired' || qrStatus.value === 'error') return
  pollStatus()
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 开始登录流程 */
async function startLogin() {
  showQr.value = true
  qrStatus.value = 'loading'
  stopPolling()
  pollFailCount = 0

  try {
      const data = await $fetch<{ url: string; qrcode_key: string; cookies: string }>('/api/auth/qr')
      qrcodeKey = data.qrcode_key
      qrCookies = data.cookies || ''
      qrUrl = data.url

    // 先切换到 pending 让 canvas DOM 渲染，再 nextTick 后绘制
    qrStatus.value = 'pending'
    await renderQr(data.url)

    // 每 2 秒轮询
    pollTimer = setInterval(pollStatus, 2000)
  } catch {
    qrStatus.value = 'error'
  }
}

function closeQr() {
  showQr.value = false
  stopPolling()
  qrStatus.value = 'loading'
}

async function doLogout() {
  isMenuOpen.value = false
  await logout()
}

// 初始化：获取用户状态
onMounted(() => {
  fetchUser()
})
</script>

<style scoped>
.bilibili-login {
  position: relative;
}

.login-btn {
  background: var(--b-pink);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.login-btn:hover {
  opacity: 0.85;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.user-info:hover {
  background: rgba(255, 255, 255, 0.1);
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}
.username {
  color: #fff;
  font-size: 13px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 移动端：顶栏空间有限，只显示头像不显示用户名 */
@media (max-width: 768px) {
  .username {
    display: none;
  }
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: var(--bg-card);
  border-radius: 8px;
  padding: 8px 0;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 200;
}
.logout-btn {
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
  border-radius: 0;
  text-align: left;
  transition: background-color 0.15s;
}
.logout-btn:hover {
  background: var(--bg-hover);
}

/* QR overlay */
.qr-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.qr-modal {
  background: #1a1a1a;
  border-radius: 12px;
  padding: 24px;
  min-width: 280px;
  max-width: 90vw;
  text-align: center;
  color: #fff;
}
.qr-modal h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}
.qr-canvas {
  border-radius: 8px;
  background: #fff;
  max-width: 100%;
}
.qr-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: #aaa;
}
.app-confirm-btn {
  display: block;
  margin: 14px auto 0;
  background: var(--b-pink);
  color: #fff;
  border-radius: 6px;
  padding: 10px 16px;
  font-size: 14px;
  text-decoration: none;
  transition: opacity 0.2s;
}
.app-confirm-btn:hover {
  opacity: 0.85;
}
.app-fallback-tip {
  font-size: 12px;
  color: #888;
  line-height: 1.6;
}
.qr-loading, .qr-expired, .qr-success, .qr-error {
  padding: 20px 0;
  font-size: 14px;
  color: #aaa;
}
.qr-success {
  color: #52c41a;
}
.qr-error {
  color: #ff6b6b;
}
.retry-btn {
  margin-top: 8px;
  background: var(--b-pink);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
.close-btn {
  margin-top: 12px;
  background: transparent;
  color: #888;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 16px;
  cursor: pointer;
  font-size: 13px;
}
</style>
