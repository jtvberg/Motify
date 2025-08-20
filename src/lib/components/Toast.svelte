<script lang="ts">
	import { fade } from 'svelte/transition';
	import { toastStore } from '$lib/toast';
	import type { Toast } from '$lib/toast';
	
	let toasts: Toast[] = [];
	$: toasts = $toastStore;
	
	function removeToast(id: string) {
		toastStore.remove(id);
	}
</script>

<div class="toast-container">
	{#each toasts as toast (toast.id)}
		<div 
			class="toast toast-{toast.type}" 
			transition:fade={{ duration: 300 }}
			role="alert"
		>
			<div class="toast-content">
				<div class="toast-icon">
					{#if toast.type === 'success'}
						<i class="fas fa-check-circle"></i>
					{:else if toast.type === 'error'}
						<i class="fas fa-exclamation-circle"></i>
					{:else if toast.type === 'warning'}
						<i class="fas fa-exclamation-triangle"></i>
					{:else if toast.type === 'info'}
						<i class="fas fa-info-circle"></i>
					{/if}
				</div>
				<div class="toast-message">{toast.message}</div>
				<button 
					class="toast-close" 
					on:click={() => removeToast(toast.id)}
					aria-label="Close notification"
				>
					<i class="fas fa-times"></i>
				</button>
			</div>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
	}
	
	.toast {
		background: #2a2a2a;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-width: 300px;
		max-width: 500px;
		pointer-events: auto;
	}
	
	.toast-success {
		border-left: 4px solid #1db954;
	}
	
	.toast-error {
		border-left: 4px solid #e22134;
	}
	
	.toast-warning {
		border-left: 4px solid #ffa726;
	}
	
	.toast-info {
		border-left: 4px solid #29b6f6;
	}
	
	.toast-content {
		display: flex;
		align-items: flex-start;
		padding: 12px 16px;
		gap: 12px;
	}
	
	.toast-icon {
		flex-shrink: 0;
		font-size: 18px;
		margin-top: 2px;
	}
	
	.toast-success .toast-icon {
		color: #1db954;
	}
	
	.toast-error .toast-icon {
		color: #e22134;
	}
	
	.toast-warning .toast-icon {
		color: #ffa726;
	}
	
	.toast-info .toast-icon {
		color: #29b6f6;
	}
	
	.toast-message {
		flex: 1;
		color: #ffffff;
		font-size: 14px;
		line-height: 1.4;
		word-wrap: break-word;
	}
	
	.toast-close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: #b3b3b3;
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
		transition: all 0.2s ease;
		font-size: 12px;
	}
	
	.toast-close:hover {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.1);
	}
	
	@media (max-width: 768px) {
		.toast-container {
			top: 10px;
			right: 10px;
			left: 10px;
		}
		
		.toast {
			min-width: auto;
			max-width: none;
		}
	}
</style>
