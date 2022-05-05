# ddu-source-gtags

gtags (GNU Global) source for ddu.vim.

This source collects result of global.

**Note:** This plugin is still under development...

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddu.vim

https://github.com/Shougo/ddu.vim

### ddu-kind-file

https://github.com/Shougo/ddu-kind-file

### GNU Global

https://www.gnu.org/software/global/

## Configuration

```vim
" Use source.
" 'word' specify what you want search symbol word.
call ddu#start({'sources': [{'name': 'gtags', 'params': {'input': word}}]})
```
