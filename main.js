// 等待 DOM 和 SillyTavern 核心加载完成
jQuery(async () => {
    // 动态导入 Pretext 库
    const pretext = await import('https://esm.sh/@chenglou/pretext');
    const { prepare, layout } = pretext;

    // 获取 SillyTavern 上下文
    const context = SillyTavern.getContext();
    const eventSource = context.eventSource;
    const event_types = context.event_types;

    // 插件状态
    let active = true;
    let totalPrepareTime = 0;
    let totalLayoutTime = 0;
    let processedMessages = 0;

    // 全局缓存，存储消息的 prepare 句柄
    const preparedCache = new Map();

    // 字体配置（重要：需与 CSS 保持一致）
    const FONT = '16px "Segoe UI", "Noto Sans", system-ui, -apple-system, sans-serif';

    // 添加设置 UI 面板
    const settingsHtml = `
        <div id="pretext_profiler_settings">
            <h3>Pretext 高度分析器</h3>
            <label>
                <input type="checkbox" id="pretext_profiler_enable" checked> 启用插件
            </label>
            <div id="pretext_profiler_stats" style="margin-top: 10px; font-size: 12px;">
                <strong>统计信息</strong><br>
                处理消息数: <span id="pretext_msg_count">0</span><br>
                总 prepare 耗时: <span id="pretext_prepare_total">0</span> ms<br>
                总 layout 耗时: <span id="pretext_layout_total">0</span> ms
            </div>
            <button id="pretext_profiler_reset">重置统计</button>
            <hr>
            <div>
                <strong>测试工具</strong><br>
                <textarea id="pretext_test_text" rows="3" placeholder="输入一些文字..."></textarea>
                <button id="pretext_test_measure">测量高度</button>
                <div id="pretext_test_result"></div>
            </div>
        </div>
    `;

    // 将设置面板注入到 SillyTavern 的设置界面中
    const settingsContainer = document.getElementById('extensions_settings');
    if (settingsContainer) {
        settingsContainer.insertAdjacentHTML('beforeend', settingsHtml);
    }

    // 获取 DOM 元素引用
    const enableCheckbox = document.getElementById('pretext_profiler_enable');
    const msgCountSpan = document.getElementById('pretext_msg_count');
    const prepareTotalSpan = document.getElementById('pretext_prepare_total');
    const layoutTotalSpan = document.getElementById('pretext_layout_total');
    const resetBtn = document.getElementById('pretext_profiler_reset');
    const testTextarea = document.getElementById('pretext_test_text');
    const testMeasureBtn = document.getElementById('pretext_test_measure');
    const testResultDiv = document.getElementById('pretext_test_result');

    // 更新统计显示
    function updateStatsUI() {
        if (msgCountSpan) msgCountSpan.innerText = processedMessages;
        if (prepareTotalSpan) prepareTotalSpan.innerText = totalPrepareTime.toFixed(2);
        if (layoutTotalSpan) layoutTotalSpan.innerText = totalLayoutTime.toFixed(2);
    }

    // 重置统计
    function resetStats() {
        totalPrepareTime = 0;
        totalLayoutTime = 0;
        processedMessages = 0;
        updateStatsUI();
        console.log('Pretext Profiler: 统计信息已重置');
    }

    // 测量单条消息的高度
    function measureMessageHeight(messageElement, messageText) {
        if (!active) return null;

        try {
            let prepared = preparedCache.get(messageText);
            let prepareTime = 0;

            if (!prepared) {
                const prepareStart = performance.now();
                prepared = prepare(messageText, FONT);
                prepareTime = performance.now() - prepareStart;
                preparedCache.set(messageText, prepared);
                totalPrepareTime += prepareTime;
            } else {
                // 从缓存中获取，prepare 耗时为 0
                prepareTime = 0;
            }

            // 获取容器的可用宽度
            const container = messageElement.closest('.mes_text') || messageElement.parentElement;
            const maxWidth = container ? container.clientWidth - 20 : 400;
            const lineHeight = 24;

            const layoutStart = performance.now();
            const { height, lineCount } = layout(prepared, maxWidth, lineHeight);
            const layoutTime = performance.now() - layoutStart;
            totalLayoutTime += layoutTime;

            processedMessages++;
            updateStatsUI();

            // 记录性能数据到控制台
            console.debug(`[Pretext] 消息 "${messageText.substring(0, 30)}..." 高度=${height}px, 行数=${lineCount}, prepare=${prepareTime.toFixed(3)}ms, layout=${layoutTime.toFixed(3)}ms`);

            return height;
        } catch (error) {
            console.error('Pretext 测量失败:', error);
            return null;
        }
    }

    // 处理所有现有的聊天消息
    function processExistingMessages() {
        const messages = document.querySelectorAll('.mes');
        messages.forEach((message) => {
            const textElement = message.querySelector('.mes_text');
            if (textElement && textElement.innerText) {
                const originalHeight = message.style.height;
                const measuredHeight = measureMessageHeight(message, textElement.innerText);
                
                // 可选：应用测量后的高度到消息上
                // if (measuredHeight && !message.getAttribute('data-pretext-set')) {
                //     message.style.height = `${measuredHeight}px`;
                //     message.setAttribute('data-pretext-set', 'true');
                // }
            }
        });
    }

    // 监听新消息到达事件
    if (eventSource && event_types) {
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
            if (!active) return;
            // 延迟一点以确保 DOM 已更新
            setTimeout(() => {
                const messages = document.querySelectorAll('.mes:not([data-pretext-processed])');
                messages.forEach((message) => {
                    const textElement = message.querySelector('.mes_text');
                    if (textElement && textElement.innerText) {
                        measureMessageHeight(message, textElement.innerText);
                        message.setAttribute('data-pretext-processed', 'true');
                    }
                });
            }, 100);
        });
    }

    // 监听聊天切换事件
    if (eventSource && event_types) {
        eventSource.on(event_types.CHAT_CHANGED, () => {
            if (!active) return;
            // 清除已处理标记，重新处理
            document.querySelectorAll('.mes').forEach(msg => msg.removeAttribute('data-pretext-processed'));
            processExistingMessages();
        });
    }

    // 监听角色消息渲染事件（可选，用于更精确的时机）
    if (eventSource && event_types) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            if (!active) return;
            setTimeout(() => {
                const message = document.querySelector(`.mes[mesid="${messageId}"]`);
                if (message && !message.hasAttribute('data-pretext-processed')) {
                    const textElement = message.querySelector('.mes_text');
                    if (textElement && textElement.innerText) {
                        measureMessageHeight(message, textElement.innerText);
                        message.setAttribute('data-pretext-processed', 'true');
                    }
                }
            }, 50);
        });
    }

    // 启用/禁用插件
    if (enableCheckbox) {
        enableCheckbox.addEventListener('change', (e) => {
            active = e.target.checked;
            if (active) {
                console.log('Pretext Profiler 已启用');
                processExistingMessages();
            } else {
                console.log('Pretext Profiler 已禁用');
            }
        });
    }

    // 重置统计按钮
    if (resetBtn) {
        resetBtn.addEventListener('click', resetStats);
    }

    // 测试工具：测量输入文本的高度
    if (testMeasureBtn && testTextarea && testResultDiv) {
        testMeasureBtn.addEventListener('click', () => {
            const testText = testTextarea.value;
            if (!testText.trim()) {
                testResultDiv.innerHTML = '<span style="color: red;">请输入文本</span>';
                return;
            }

            try {
                const prepareStart = performance.now();
                const prepared = prepare(testText, FONT);
                const prepareTime = performance.now() - prepareStart;

                const maxWidth = 400;
                const lineHeight = 24;
                const layoutStart = performance.now();
                const { height, lineCount } = layout(prepared, maxWidth, lineHeight);
                const layoutTime = performance.now() - layoutStart;

                testResultDiv.innerHTML = `
                    <strong>测量结果:</strong><br>
                    文本长度: ${testText.length} 字符<br>
                    预估高度: ${height.toFixed(2)} px<br>
                    行数: ${lineCount}<br>
                    prepare 耗时: ${prepareTime.toFixed(3)} ms<br>
                    layout 耗时: ${layoutTime.toFixed(3)} ms
                `;
            } catch (error) {
                testResultDiv.innerHTML = `<span style="color: red;">错误: ${error.message}</span>`;
            }
        });
    }

    // 初始处理
    setTimeout(() => {
        processExistingMessages();
        console.log('Pretext Height Profiler 插件已加载，由 Pretext 提供动力');
    }, 1000);
});