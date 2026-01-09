import usePromptStore from '../store/promptStore'

export const usePrompt = () => {
  const { show } = usePromptStore()
  return show
}



