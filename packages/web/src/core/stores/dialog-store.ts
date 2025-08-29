import { defineStore } from 'pinia'
import { readonly, ref, markRaw, type Component } from 'vue'

interface DialogState {
  open: boolean
  title: string | null
  description?: string | null
  content: Component | null
}

const defaultState: Readonly<DialogState> = {
  open: false,
  title: null,
  description: null,
  content: null,
}

export const useDialogStore = defineStore('dialog', () => {
  const dialogState = ref<DialogState>(defaultState)

  function setOpen(open: boolean) {
    dialogState.value.open = open
  }

  function openDialog(state: Omit<DialogState, 'open'>) {
    dialogState.value = {
      ...state,
      // Mark the component as raw to prevent reactivity
      content: state.content ? markRaw(state.content) : null,
      open: true,
    }
  }

  function closeDialog() {
    setOpen(false)
    setTimeout(() => {
      dialogState.value = defaultState
      // 200 is the animation duration
    }, 200)
  }

  return {
    dialogState: readonly(dialogState),
    setOpen,
    openDialog,
    closeDialog,
  }
})
