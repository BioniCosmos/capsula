const std = @import("std");
const debug = std.debug;
const Io = std.Io;
const process = std.process;

const msgpack = @import("msgpack");

const VM = @import("VM.zig");

pub fn main(init: process.Init) !void {
    const allocator = init.arena.allocator();
    const temp_allocator = init.gpa;
    const io = init.io;

    const args = try init.minimal.args.toSlice(allocator);
    if (args.len < 2) {
        debug.print("bytecode file path required\n", .{});
        return;
    }
    const path = args[1];

    const file = try Io.Dir.cwd().openFile(io, path, .{});
    defer file.close(io);

    var buf: [1024]u8 = undefined;
    var reader = file.reader(io, &buf);

    var packer = msgpack.packIO(&reader.interface, @constCast(&Io.Writer.failing));
    const payload = try packer.read(temp_allocator);

    const vm = try VM.init(allocator, io);
    defer vm.deinit();

    for (0..try payload.getArrLen()) |i| {
        _ = try vm.addVar(try VM.Var.deserialize(try payload.getArrElement(i)));
    }

    payload.free(temp_allocator);

    const bytecode = try reader.interface.allocRemaining(temp_allocator, .unlimited);
    _ = try vm.execute(bytecode);
    temp_allocator.free(bytecode);
}
