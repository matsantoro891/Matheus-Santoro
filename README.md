# cReScer juntos - Versão 2

Aplicativo web responsivo/PWA para pais registrarem saúde, calendário e memórias dos filhos.

## Novidades desta versão

- Botão **Salvar criança cadastrada** na aba Cadastro.
- Botão **Criar PDF completo** na aba PDF / QR.
- Botão **Criar QR Code do PDF**.
- O QR Code abre uma página compartilhável (`report.html`) com as principais informações da criança e botão para baixar/imprimir o PDF.
- Exportação e importação de backup JSON.
- PWA com manifest, service worker, ícones Android/iPhone e Apple Touch Icon.

## Conteúdo do PDF

O PDF inclui:

- Dados do cadastro da criança.
- Problemas de saúde e alergias.
- Responsáveis e contatos de emergência.
- Pediatra.
- Medicações cadastradas.
- Exames cadastrados.
- Eventos do calendário.

Os anexos não são incorporados ao PDF nesta versão; seus nomes são listados no relatório.

## Observação importante sobre QR Code

Sem backend em nuvem, o QR Code carrega um resumo compacto dos principais dados da criança no próprio link. Para compartilhar PDFs grandes, anexos ou dados completos entre vários dispositivos, a próxima etapa técnica deve ser integrar Firebase ou Supabase com armazenamento de arquivos e autenticação.

## Publicação

Pode ser publicado em Netlify, Vercel ou GitHub Pages. Após publicar, abrir o link no celular e selecionar "Adicionar à Tela Inicial" para instalar como aplicativo PWA.
