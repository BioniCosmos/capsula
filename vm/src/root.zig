const std = @import("std");
const mem = std.mem;

pub export fn execute(bytecode: [*]const u8, len: u64) void {
    var i: usize = 0;
    while (i < len) {
        switch (bytecode[i]) {
            0 => {
                i += 1;
                const lhs = mem.readInt(i64, bytecode[i .. i + 8][0..8], .little);
                i += 8;
                const rhs = mem.readInt(i64, bytecode[i .. i + 8][0..8], .little);
                i += 8;
                std.debug.print("{}\n", .{lhs + rhs});
            },
            else => unreachable,
        }
    }
}
