# Crescer Juntos — v7

Atualização mantendo a identidade visual anterior e acrescentando:

- Botões principais menores e mais modernos na tela inicial.
- Nova área **Arquivos Médicos** dentro da aba Saúde.
- Pesquisa, ordenação, visualização, download, edição e exclusão de arquivos médicos.
- Opção **Incluir Arquivos Médicos** no PDF Resumo da Criança.
- Memórias com até 5 anexos por memória.
- Grade estilo Instagram mostrando a primeira foto/capa.
- Indicador visual de múltiplos anexos.
- Visualização de memória em modal com carrossel.
- Suporte a fotos, vídeos e documentos na memória.
- Botões para visualizar, baixar, compartilhar, substituir e excluir anexos.
- Botão Baixar todos em memórias com múltiplos anexos.
- PDFs com padrão visual mais moderno, familiar e profissional.
- Melhor preservação da orientação das imagens nos PDFs.

Versão local/PWA. Para sincronização real entre dispositivos, backend futuro recomendado: Firebase ou Supabase.


## Atualização v10
Os anexos de Saúde > Exames agora são armazenados permanentemente em IndexedDB, preservando nome, tipo MIME, tamanho e conteúdo após fechar ou recarregar o PWA. O backup também inclui esses anexos.


## Atualização Marcos & Evolução
- Categorias disponíveis: Peso, Altura, Desenvolvimento motor e Categoria personalizada.
- Peso em kg e altura em metros.
- Gráficos de peso/idade e altura/idade com curvas e percentis OMS por sexo e idade.
- Edição e exclusão confirmada dos registros.


## Atualização v13
- Home usa exclusivamente `icons/logo-main.png` como logo visual.
- Ícones `icon-192.png` e `icon-512.png` permanecem exclusivos para instalação/PWA.
- Logo da Home centralizado, inteiro e com `object-fit: contain`.


## Atualização v14 — persistência local completa

- Fotos de perfil, anexos de Exames, Arquivos Médicos, fotos/vídeos/documentos das Memórias e fotos de Marcos & Evolução são armazenados como Blob no IndexedDB.
- O localStorage guarda apenas os dados textuais e metadados leves.
- Ao iniciar o PWA, os arquivos são recuperados do IndexedDB e as URLs temporárias de visualização são recriadas.
- Backups incluem todos os arquivos em Base64 e a restauração devolve os conteúdos ao IndexedDB.
- O aplicativo solicita armazenamento persistente ao navegador quando o recurso está disponível.


## Atualização v15 — visualização de imagens no celular

- Memórias e Exames recuperam a imagem original diretamente do IndexedDB antes de abrir o visualizador.
- O object URL é criado somente durante a visualização e revogado ao fechar ou trocar de item.
- Há fallback para Base64 quando o object URL não é aceito pelo navegador.
- O modal só é exibido depois do carregamento da imagem; falhas mostram mensagem amigável.
- No celular, o carrossel usa swipe horizontal e oculta os botões Anterior/Próxima.
- No computador, os botões e as setas do teclado continuam disponíveis.
- Miniaturas otimizadas são salvas no IndexedDB e usadas na grade.
- Backup e restauração continuam incluindo os arquivos originais e suas miniaturas.
- Texto discreto “— cReSer Juntos —” adicionado ao final da Home.


## Versão 16
Correção específica da visualização de imagens no iPhone/Safari/PWA: carregamento assíncrono do Blob salvo no IndexedDB, Data URL como fonte primária no iOS, Object URL mantida até fechar/trocar a imagem, mensagens de erro e cache versionado com estratégia network-first.


## Atualização v17
- Na tela inicial, o atalho de Calendário/Eventos passou a exibir apenas “Eventos”.
- O ícone de calendário foi mantido.
- Nenhuma outra funcionalidade, tela, texto, cor ou layout foi alterado.
