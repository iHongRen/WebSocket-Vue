import { ref, watchEffect, watch } from 'vue'
import useWebSocket, { SocketStatus } from './useWebSocket'
// 用户的store,用于检测登录
import { useAdminStore } from '@stores/adminStore'

export default function useSocket() {
    const { status, message, error, connect, disconnect } = useWebSocket({
        url: 'your webosckt url',
        heartBeatData: 'your heart data'
    })

    const { isLogin } = storeToRefs(useAdminStore())
    const chatMessage = ref(null)
    const socketStatusText = ref('')

    window.addEventListener('offline', function () {
        console.log('网络连接已断开')
    })

    window.addEventListener('online', function () {
        console.log('网络连接已恢复')
        // 在网络连接恢复后执行的操作
        retryConnect()
    })

    watch(
        () => status.value,
        newVal => {
            if (newVal != SocketStatus.Connected) {
                socketStatusText.value = newVal
            }
        }
    )

    watch(
        () => message.value,
        newVal => {
            if (newVal) {
                chatMessage.value = newVal
            }
        }
    )

    watchEffect(() => {
        // 检测登录后就发起连接，退出后断开连接
        if (isLogin.value) {
            connect()
        } else {
            disconnect()
        }
    })

    const retryConnect = () => {
        if (status.value !== SocketStatus.Connected) {
            connect()
        }
    }

    return {
        socketStatusText,
        chatMessage,
        retryConnect
    }
}
