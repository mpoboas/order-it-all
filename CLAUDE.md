# Instruções para o Claude Code

## Codegraph

Sempre que for necessário analisar ou explorar este projeto (perceber como algo funciona, localizar
símbolos, avaliar o impacto de uma mudança, etc.), usar a ferramenta `mcp__codegraph__codegraph_explore`
antes de recorrer a leitura manual de ficheiros ou grep. O codegraph mantém um grafo de conhecimento
indexado do workspace e devolve o código-fonte relevante já acompanhado de quem o chama e o que afeta,
com muito menos chamadas do que uma exploração manual.
