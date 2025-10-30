import { defineStore } from 'pinia'
import { readonly, ref, markRaw, type Component, type Ref, type DeepReadonly } from 'vue'

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

interface DialogStore {
  dialogState: DeepReadonly<Ref<DialogState>>
  setOpen(open: boolean): void
  openDialog(state: Omit<DialogState, 'open'>): void
  closeDialog(): void
}

export const useDialogStore = defineStore('dialog', (): DialogStore => {
  const dialogState = ref<DialogState>(defaultState)

  function setOpen(open: boolean) {
    dialogState.value.open = open
  }

  function openDialog(state: Omit<DialogState, 'open'>) {
    dialogState.value = {
      ...state,
      content: state.content ? markRaw(state.content) : null,
      open: true,
    }
  }

  function closeDialog() {
    setOpen(false)
    setTimeout(() => {
      dialogState.value = defaultState
    }, 200)
  }

  return {
    dialogState: readonly(dialogState),
    setOpen,
    openDialog,
    closeDialog,
  }
})
