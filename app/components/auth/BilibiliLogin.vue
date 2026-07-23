<template>
  <div class="bilibili-login">
    <!-- 未登录 -->
    <button v-if="!isLoggedIn" class="login-btn" @click="startLogin">
      B站登录
    </button>

    <!-- 已登录 -->
    <div v-else class="user-info" @click="showMenu = !showMenu">
      <img
        v-if="user?.bilibiliFace"
        :src="user.bilibiliFace"
        :alt="user.bilibiliUname"
        class="avatar"
        referrerpolicy="no-referrer"
      />
      <span class="username">{{ user?.bilibiliUname }}</span>
      <div v-if="showMenu" class="dropdown-menu">
        <button class="logout-btn" @click.stop="doLogout">退出登录</button>
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
            <p class="qr-tip">
              {{ qrStatus === 'scanned' ? '✓ 已扫码，请在手机上确认' : '请使用 B站客户端 扫码登录' }}
            </p>
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

const { user, isLoggedIn, fetchUser, logout } = useAuth()

const showQr = ref(false)
const qrStatus = ref<'loading' | 'pending' | 'scanned' | 'expired' | 'success' | 'error'>('loading')
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const showMenu = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let qrcodeKey = ''

/** 生成二维码到 canvas */
async function renderQr(url: string) {
  await nextTick()
  const canvas = qrCanvasRef.value
  if (!canvas) return
  await QRCode.toCanvas(canvas, url, { width: 200, margin: 1 })
}

/** 轮询扫码状态 */
async function pollStatus() {
  if (!qrcodeKey) return

  try {
    const data = await $fetch<{
      status: string
      message?: string
    }>('/api/auth/qr-check', { params: { qrcode_key: qrcodeKey } })

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
      case 'success':
        qrStatus.value = 'success'
        stopPolling()
        setTimeout(async () => {
          showQr.value = false
          await fetchUser()
        }, 800)
        break
    }
  } catch {
    qrStatus.value = 'error'
    stopPolling()
  }
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

  try {
    const data = await $fetch<{ url: string; qrcode_key: string }>('/api/auth/qr')
    qrcodeKey = data.qrcode_key

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
  showMenu.value = false
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

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #2a2a2a;
  border-radius: 6px;
  padding: 4px;
  min-width: 100px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 100;
}
.logout-btn {
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #ff6b6b;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
}
.logout-btn:hover {
  background: rgba(255, 107, 107, 0.15);
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
}
.qr-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: #aaa;
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
