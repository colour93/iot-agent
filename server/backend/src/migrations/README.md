使用 TypeORM CLI 生成/执行迁移示例：

```bash
# 生成
pnpm typeorm migration:generate -d dist/db/data-source.js src/migrations/InitSchema

# 运行
pnpm typeorm migration:run -d dist/db/data-source.js
```

当前建议：开发环境使用 `pnpm build` 后，再运行迁移指向 dist 数据源。

