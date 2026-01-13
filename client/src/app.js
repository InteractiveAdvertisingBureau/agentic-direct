/**
 * A2A Agent Test Client using Official @a2a-js/sdk
 * Browser-based UI with @a2a-js/sdk ClientFactory
 */

import { ClientFactory } from '@a2a-js/sdk/client';

class A2ASDKClient {
    constructor() {
        this.serverUrl = '';
        this.currentAgent = 'buyer';
        this.clientFactory = new ClientFactory();
        this.client = null;
        this.agentCard = null;
        this.tasks = new Map();

        this.initializeUI();
    }

    initializeUI() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());

        // Agent selection
        document.querySelectorAll('input[name="agent"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentAgent = e.target.value;
                this.client = null;
                this.agentCard = null;
                document.getElementById('agentInfo').style.display = 'none';
                document.getElementById('sendBtn').disabled = true;
            });
        });

        // Send message
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());

        // Enter key to send
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Quick action buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const message = e.target.dataset.message;
                document.getElementById('messageInput').value = message;
                this.sendMessage();
            });
        });

        // Clear debug log
        document.getElementById('clearDebugBtn').addEventListener('click', () => {
            document.getElementById('debugLog').innerHTML = '';
        });

        // Update server URL
        document.getElementById('serverUrl').addEventListener('change', (e) => {
            this.serverUrl = e.target.value.trim().replace(/\/+$/, '');
        });
    }

    async connect() {
        const btn = document.getElementById('connectBtn');
        btn.disabled = true;
        btn.innerHTML = 'Connecting... <span class="loading"></span>';

        // Get server URL from input field and remove trailing slash
        this.serverUrl = document.getElementById('serverUrl').value.trim().replace(/\/+$/, '');

        if (!this.serverUrl) {
            this.log('error', 'Server URL is required');
            this.addSystemMessage('❌ Please enter a server URL');
            btn.disabled = false;
            btn.textContent = 'Connect';
            return;
        }

        try {
            this.log('info', `🔌 Connecting to ${this.currentAgent} agent using @a2a-js/sdk ClientFactory`);

            // Build agent card URL
            const agentCardUrl = `${this.serverUrl}/a2a/${this.currentAgent}/.well-known/agent-card.json`;
            this.log('info', `📥 Fetching agent card: ${agentCardUrl}`);

            // Use ClientFactory to create client (official SDK way!)
            this.client = await this.clientFactory.createFromUrl(agentCardUrl, '');

            // Fetch agent card for display
            const response = await fetch(agentCardUrl);
            this.agentCard = await response.json();

            this.log('info', `✅ Connected via @a2a-js/sdk ClientFactory`);
            this.log('info', `   Agent: ${this.agentCard.name}`);
            this.log('info', `   Protocol: ${this.agentCard.protocolVersion}`);

            // Display agent info
            this.displayAgentInfo();

            // Enable send button
            document.getElementById('sendBtn').disabled = false;

            this.addSystemMessage(`✅ Connected to ${this.agentCard.name} using official @a2a-js/sdk`);

        } catch (error) {
            this.log('error', `❌ Connection failed: ${error.message}`);
            this.addSystemMessage(`❌ Connection failed: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Connect';
        }
    }

    displayAgentInfo() {
        const infoDiv = document.getElementById('agentInfo');
        const detailsDiv = document.getElementById('agentDetails');

        const skills = this.agentCard.skills.map(s => s.name).join(', ');
        const transports = this.agentCard.additionalInterfaces.map(i => i.transport).join(', ');

        detailsDiv.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">Name:</span> ${this.agentCard.name}
            </div>
            <div class="detail-item">
                <span class="detail-label">Protocol Version:</span> ${this.agentCard.protocolVersion}
            </div>
            <div class="detail-item">
                <span class="detail-label">SDK:</span> @a2a-js/sdk/client (Official)
            </div>
            <div class="detail-item">
                <span class="detail-label">Skills:</span> ${skills}
            </div>
            <div class="detail-item">
                <span class="detail-label">Transports:</span> ${transports}
            </div>
            <div class="detail-item">
                <span class="detail-label">Streaming:</span> ${this.agentCard.capabilities.streaming ? '✅' : '❌'}
            </div>
        `;

        infoDiv.style.display = 'block';
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const messageText = input.value.trim();

        if (!messageText) return;
        if (!this.client) {
            alert('Please connect to an agent first');
            return;
        }

        // Clear input
        input.value = '';

        // Add user message to chat
        this.addUserMessage(messageText);

        try {
            this.log('info', `📤 Sending message via @a2a-js/sdk: "${messageText}"`);

            // Create A2A message using SDK format
            const message = {
                messageId: this.generateId(),
                role: 'user',
                parts: [{
                    kind: 'text',
                    text: messageText
                }],
                kind: 'message'
            };

            // Send using official SDK client.sendMessage()
            const response = await this.client.sendMessage(message);

            this.log('info', `📨 Response received from SDK`);
            console.log('Full SDK response:', response);

            // Handle response - SDK returns either Message or Task
            if (response) {
                this.log('info', `Response kind: ${response.kind}`);

                if (response.kind === 'task') {
                    // SDK returned a Task (async operation)
                    this.log('info', 'Handling as Task');
                    this.handleTask(response);
                } else if (response.kind === 'message') {
                    // SDK returned immediate Message (operation completed quickly)
                    this.log('info', 'Received immediate message response');

                    // Create a pseudo-task for display purposes
                    const pseudoTask = {
                        kind: 'task',
                        id: response.taskId || this.generateId(),
                        contextId: response.contextId,
                        status: {
                            state: 'completed'
                        },
                        history: [
                            message, // Original user message
                            response // Agent's response message
                        ]
                    };

                    this.handleTask(pseudoTask);
                } else {
                    this.log('error', `Unknown response type: ${response.kind || 'no kind'}`);
                }
            }

        } catch (error) {
            this.log('error', `❌ Failed to send message: ${error.message}`);
            this.addSystemMessage(`❌ Error: ${error.message}`);
        }
    }

    handleTask(task) {
        // Defensive check for task structure
        if (!task || !task.status) {
            this.log('error', `Invalid task structure: ${JSON.stringify(task)}`);
            return;
        }

        this.log('info', `📋 Task created: ${task.id}, status: ${task.status.state}`);

        // Check if we've already processed this task
        const existingTask = this.tasks.get(task.id);
        const existingAgentMessageCount = existingTask?.history?.filter(h => h.role === 'agent').length || 0;
        const newAgentMessageCount = task.history?.filter(h => h.role === 'agent').length || 0;

        // Store task
        this.tasks.set(task.id, task);

        // Add to task list
        this.updateTaskList();

        // Only show NEW agent messages (not already displayed)
        if (task.history && newAgentMessageCount > existingAgentMessageCount) {
            const agentMessages = task.history.filter(h => h.role === 'agent');
            const newMessages = agentMessages.slice(existingAgentMessageCount);

            this.log('info', `Displaying ${newMessages.length} new agent messages (${existingAgentMessageCount} already shown)`);

            newMessages.forEach(msg => {
                // Extract text parts
                const textParts = msg.parts?.filter(p => p.kind === 'text') || [];
                const text = textParts.map(p => p.text).join('\n');

                // Extract data parts
                const dataParts = msg.parts?.filter(p => p.kind === 'data') || [];
                const data = dataParts.length > 0 ? dataParts[0].data : null;

                if (text) {
                    this.addAgentMessage(text, data);
                }
            });
        }

        // Poll for completion if still working
        if (task.status && task.status.state === 'working') {
            this.pollTask(task.id);
        }
    }

    async pollTask(taskId) {
        const maxAttempts = 30;
        let attempts = 0;
        let shownAgentMessages = 0;

        const existingTask = this.tasks.get(taskId);
        if (existingTask?.history) {
            shownAgentMessages = existingTask.history.filter(h => h.role === 'agent').length;
        }

        const poll = async () => {
            if (attempts++ >= maxAttempts) {
                this.log('error', `⏱️ Task ${taskId} polling timeout`);
                return;
            }

            try {
                // Use SDK's getTask method
                const task = await this.client.getTask(taskId);

                // Validate task structure
                if (!task || !task.status) {
                    this.log('error', `Invalid task structure from poll: ${JSON.stringify(task)}`);
                    return;
                }

                // Update task in map
                this.tasks.set(taskId, task);
                this.updateTaskList();

                // Check for new agent messages
                const agentMessages = task.history?.filter(h => h.role === 'agent') || [];

                if (agentMessages.length > shownAgentMessages) {
                    const newMessages = agentMessages.slice(shownAgentMessages);
                    this.log('info', `💬 Found ${newMessages.length} new agent messages`);

                    newMessages.forEach(msg => {
                        // Extract text parts
                        const textParts = msg.parts?.filter(p => p.kind === 'text') || [];
                        const text = textParts.map(p => p.text).join('\n');

                        // Extract data parts
                        const dataParts = msg.parts?.filter(p => p.kind === 'data') || [];
                        const data = dataParts.length > 0 ? dataParts[0].data : null;

                        if (text) {
                            this.addAgentMessage(text, data);
                        }
                    });

                    shownAgentMessages = agentMessages.length;
                }

                if (task.status.state === 'completed') {
                    this.log('info', `✅ Task ${taskId} completed`);
                } else if (task.status.state === 'failed') {
                    this.log('error', `❌ Task ${taskId} failed`);
                } else if (task.status.state === 'working') {
                    // Continue polling
                    setTimeout(poll, 1000);
                }

            } catch (error) {
                this.log('error', `❌ Failed to poll task ${taskId}: ${error.message}`);
            }
        };

        poll();
    }

    updateTaskList() {
        const listDiv = document.getElementById('taskList');

        if (this.tasks.size === 0) {
            listDiv.innerHTML = '<div class="empty-state">No active tasks</div>';
            return;
        }

        listDiv.innerHTML = '';

        // Show tasks in reverse chronological order
        const taskArray = Array.from(this.tasks.values()).reverse();
        taskArray.forEach(task => {
            // Skip tasks with invalid structure
            if (!task || !task.status) {
                return;
            }

            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-item';

            const userMessage = task.history?.find(h => h.role === 'user');
            const userText = userMessage?.parts?.[0]?.text || 'No message';
            const statusState = task.status?.state || 'unknown';

            taskDiv.innerHTML = `
                <div class="task-header">
                    <span class="task-id">🆔 ${task.id.substring(0, 8)}...</span>
                    <span class="task-status status-${statusState}">${statusState}</span>
                </div>
                <div class="task-content">
                    <strong>Request:</strong> ${userText}
                </div>
            `;

            listDiv.appendChild(taskDiv);
        });
    }

    addUserMessage(text) {
        this.addMessage('user', '👤 You', text, null);
    }

    addAgentMessage(text, data = null) {
        this.addMessage('agent', '🤖 Agent', text, data);
    }

    addSystemMessage(text) {
        this.addMessage('system', '⚙️ System', text, null);
    }

    addMessage(type, header, text, data = null) {
        const messagesDiv = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;

        const dataHtml = data ? `
            <details class="message-data">
                <summary>📊 Response Data</summary>
                <pre>${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>
            </details>
        ` : '';

        messageDiv.innerHTML = `
            <div class="message-header">${header}</div>
            <div class="message-content">${this.escapeHtml(text)}</div>
            ${dataHtml}
        `;

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    log(level, message) {
        const logDiv = document.getElementById('debugLog');
        const entry = document.createElement('div');
        entry.className = `debug-entry debug-${level}`;

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="debug-timestamp">[${timestamp}]</span> ${this.escapeHtml(message)}`;

        logDiv.appendChild(entry);
        logDiv.scrollTop = logDiv.scrollHeight;

        // Also log to console
        console.log(`[${level.toUpperCase()}] ${message}`);
    }

    generateId() {
        return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the client when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.a2aSDKClient = new A2ASDKClient();
    console.log('✅ A2A SDK Client initialized with @a2a-js/sdk/client');
    console.log('📦 Using official ClientFactory from @a2a-js/sdk');
});
